use std::{
    future::Future,
    time::{Duration, Instant},
};

use serde::Serialize;
use tokio::time::sleep;

use crate::{
    db,
    models::{JobStatus, PipelineStep},
    pipeline::tradingview::TradingView,
    sse,
};

const PIPELINE: &[PipelineStep] = &[
    PipelineStep::BasicInfo,
    PipelineStep::Earnings,
    PipelineStep::Forecast,
    PipelineStep::Document,
];

const INTER_TICKER_DELAY: Duration = Duration::from_secs(3);
const IDLE_POLL_INTERVAL: Duration = Duration::from_secs(10);
const STARTUP_DELAY: Duration = Duration::from_secs(5);
const MAX_ATTEMPTS: i64 = 3;

pub fn start() {
    tokio::spawn(async move {
        sleep(STARTUP_DELAY).await;

        if let Err(e) = db::jobs::reset_running_to_pending().await {
            tracing::error!("Failed to reset running jobs on startup: {e}");
        }

        match db::watchlists::list_all_active_stocks().await {
            Ok(stocks) => {
                tracing::info!(
                    "Checking {} ticker/watchlist pairs on startup",
                    stocks.len()
                );
                for (symbol, watchlist_id) in stocks {
                    match db::jobs::get_latest(&symbol, watchlist_id).await {
                        Ok(Some(job)) if job.status == crate::models::JobStatus::Completed => {
                            tracing::debug!(
                                symbol,
                                watchlist_id,
                                "Skipping completed job on startup"
                            );
                        }
                        _ => {
                            if let Err(e) = db::jobs::enqueue(&symbol, watchlist_id).await {
                                tracing::error!(
                                    symbol,
                                    watchlist_id,
                                    "Failed to enqueue on startup: {e}"
                                );
                            }
                        }
                    }
                }
            }
            Err(e) => tracing::error!("Failed to load active stocks for startup enqueue: {e}"),
        }

        loop {
            match db::jobs::get_pending().await {
                Ok(Some(job)) => {
                    let symbol = job.symbol.clone();
                    let watchlist_id = job.watchlist_id;
                    tracing::info!(symbol, watchlist_id, job_id = job.id, "Processing job");
                    process_job(job).await;
                    sleep(INTER_TICKER_DELAY).await;
                }
                Ok(None) => sleep(IDLE_POLL_INTERVAL).await,
                Err(e) => {
                    tracing::error!("Queue poll error: {e}");
                    sleep(Duration::from_secs(5)).await;
                }
            }
        }
    });
}

fn broadcast_job(
    job_id: i64,
    symbol: &str,
    watchlist_id: i64,
    status: JobStatus,
    step: PipelineStep,
    error: Option<String>,
) {
    sse::broadcast(sse::SseMessage::Job(sse::JobEvent {
        job_id,
        symbol: symbol.to_string(),
        watchlist_id,
        status,
        step,
        error,
    }));
}

fn backoff_delay(attempt: i64) -> Duration {
    match attempt {
        1 => Duration::from_secs(5),
        2 => Duration::from_secs(15),
        _ => Duration::from_secs(30),
    }
}

/// Returns the index into PIPELINE of the first step without cached data,
/// or None if all steps are already cached.
async fn find_resume_step(job_id: i64) -> Result<Option<usize>, String> {
    for (i, &step) in PIPELINE.iter().enumerate() {
        let cached = db::jobs::get_step_data(job_id, step)
            .await
            .map_err(|e| e.to_string())?
            .is_some();
        if !cached {
            return Ok(Some(i));
        }
    }
    Ok(None)
}

async fn run_step<T, F, Fut>(job_id: i64, step: PipelineStep, f: F) -> Result<(), String>
where
    F: Fn() -> Fut,
    Fut: Future<Output = anyhow::Result<T>>,
    T: Serialize,
{
    let mut last_err = String::new();
    for attempt in 1i64..=MAX_ATTEMPTS {
        let t0 = Instant::now();
        let ms = || t0.elapsed().as_millis() as i64;
        match f().await {
            Ok(data) => {
                let json =
                    serde_json::to_value(&data).map_err(|e| format!("serialize error: {e}"))?;
                db::jobs::save_step_data(job_id, step, &json).await.ok();
                db::jobs::record_attempt(job_id, step, attempt, true, None, Some(ms()))
                    .await
                    .ok();
                tracing::info!(job_id, attempt, ms = ms(), ?step, "Step succeeded");
                return Ok(());
            }
            Err(e) => {
                last_err = format!("{e:#}");
                tracing::warn!(job_id, attempt, ?step, error = %last_err, "Step failed");
                db::jobs::record_attempt(job_id, step, attempt, false, Some(&last_err), Some(ms()))
                    .await
                    .ok();
                if attempt < MAX_ATTEMPTS {
                    sleep(backoff_delay(attempt)).await;
                }
            }
        }
    }
    Err(last_err)
}

/// Dispatches the right scraper for each pipeline step.
async fn execute_step(
    job_id: i64,
    step: PipelineStep,
    tv: &TradingView,
    exchange: &str,
    symbol: &str,
) -> Result<(), String> {
    match step {
        PipelineStep::BasicInfo => {
            run_step(job_id, step, || tv.fetch_basic_info(exchange, symbol)).await
        }
        PipelineStep::Earnings => {
            run_step(job_id, step, || tv.fetch_earnings_data(exchange, symbol)).await
        }
        PipelineStep::Forecast => {
            run_step(job_id, step, || tv.fetch_forecast_data(exchange, symbol)).await
        }
        PipelineStep::Document => {
            run_step(job_id, step, || tv.fetch_earnings_release(exchange, symbol)).await
        }
        PipelineStep::Queued | PipelineStep::Done => Ok(()),
    }
}

async fn process_job(job: db::jobs::AnalysisJob) {
    let job_id = job.id;
    let symbol = job.symbol.clone();
    let watchlist_id = job.watchlist_id;

    if let Err(e) = try_process_job(job_id, &symbol, watchlist_id).await {
        tracing::warn!(job_id, symbol, "Job failed permanently: {e}");
        db::jobs::fail(job_id, &e).await.ok();
        broadcast_job(
            job_id,
            &symbol,
            watchlist_id,
            JobStatus::Failed,
            PipelineStep::Queued,
            Some(e),
        );
    }
}

async fn try_process_job(job_id: i64, symbol: &str, watchlist_id: i64) -> Result<(), String> {
    let Some(start) = find_resume_step(job_id).await? else {
        // All steps already cached — just mark complete.
        db::jobs::complete(job_id).await.ok();
        broadcast_job(
            job_id,
            symbol,
            watchlist_id,
            JobStatus::Completed,
            PipelineStep::Done,
            None,
        );
        return Ok(());
    };

    let exchange = db::watchlists::get_exchange(symbol)
        .await
        .map_err(|e| format!("DB error fetching exchange: {e}"))?
        .ok_or_else(|| "Exchange not found in DB".to_string())?;

    let resume_at = PIPELINE[start];
    db::jobs::set_running(job_id, resume_at).await.ok();
    broadcast_job(
        job_id,
        symbol,
        watchlist_id,
        JobStatus::Running,
        resume_at,
        None,
    );

    let tv = TradingView::new()
        .await
        .map_err(|e| format!("Chrome connection failed: {e:#}"))?;

    for (i, &step) in PIPELINE[start..].iter().enumerate() {
        if i > 0 {
            db::jobs::set_step(job_id, step).await.ok();
            broadcast_job(job_id, symbol, watchlist_id, JobStatus::Running, step, None);
        }
        execute_step(job_id, step, &tv, &exchange, symbol).await?;
    }

    db::jobs::complete(job_id).await.ok();
    broadcast_job(
        job_id,
        symbol,
        watchlist_id,
        JobStatus::Completed,
        PipelineStep::Done,
        None,
    );
    tracing::info!(job_id, symbol, watchlist_id, "Job completed");

    Ok(())
}
