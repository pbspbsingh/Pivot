use std::{
    future::Future,
    time::{Duration, Instant},
};

use serde::{Serialize, de::DeserializeOwned};
use tokio::sync::OnceCell;
use tokio::time::sleep;

use crate::{
    db,
    models::pipeline::{EarningsData, EarningsRelease, ForecastData, StockBasicInfo},
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
const MAX_JOB_RETRIES: i64 = 3;

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
                        Ok(Some(job))
                            if job.status == JobStatus::Completed
                                || (job.status == JobStatus::Failed
                                    && job.retry_count >= MAX_JOB_RETRIES) =>
                        {
                            tracing::debug!(symbol, watchlist_id, status = ?job.status, "Skipping job on startup");
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
                    tracing::info!(
                        symbol = job.symbol,
                        watchlist_id = job.watchlist_id,
                        job_id = job.id,
                        "Processing job"
                    );
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

/// Returns the index of the first step without cached data, or None if all steps are cached.
async fn find_resume_step(job_id: i64) -> Result<Option<usize>, String> {
    for (i, &step) in PIPELINE.iter().enumerate() {
        if db::jobs::get_step_data(job_id, step)
            .await
            .map_err(|e| e.to_string())?
            .is_none()
        {
            return Ok(Some(i));
        }
    }
    Ok(None)
}

async fn run_step<T, F, Fut>(
    job_id: i64,
    step: PipelineStep,
    attempt: i64,
    f: F,
) -> Result<(), String>
where
    F: Fn() -> Fut,
    Fut: Future<Output = anyhow::Result<T>>,
    T: Serialize,
{
    let t0 = Instant::now();
    let ms = || t0.elapsed().as_millis() as i64;
    match f().await {
        Ok(data) => {
            let json = serde_json::to_value(&data).map_err(|e| format!("serialize error: {e}"))?;
            db::jobs::save_step_data(job_id, step, &json).await.ok();
            db::jobs::record_attempt(job_id, step, attempt, true, None, Some(ms()))
                .await
                .ok();
            tracing::info!(job_id, attempt, ms = ms(), ?step, "Step succeeded");
            Ok(())
        }
        Err(e) => {
            let err = format!("{e:#}");
            tracing::warn!(job_id, attempt, ?step, error = %err, "Step failed");
            db::jobs::record_attempt(job_id, step, attempt, false, Some(&err), Some(ms()))
                .await
                .ok();
            Err(err)
        }
    }
}

async fn load_step_data<T: DeserializeOwned>(job_id: i64, step: PipelineStep) -> Result<T, String> {
    let json = db::jobs::get_step_data(job_id, step)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Missing step data for {step:?} in job {job_id}"))?;
    serde_json::from_value(json).map_err(|e| format!("Deserialize error for {step:?}: {e}"))
}

async fn save_analysis(job_id: i64, symbol: &str, watchlist_id: i64) -> Result<(), String> {
    let basic_info: StockBasicInfo = load_step_data(job_id, PipelineStep::BasicInfo).await?;
    let earnings: EarningsData = load_step_data(job_id, PipelineStep::Earnings).await?;
    let forecast: Option<ForecastData> = load_step_data(job_id, PipelineStep::Forecast).await?;
    let document: EarningsRelease = load_step_data(job_id, PipelineStep::Document).await?;
    db::analysis::upsert(
        symbol,
        watchlist_id,
        &basic_info,
        &earnings,
        forecast.as_ref(),
        &document,
    )
    .await
    .map_err(|e| e.to_string())
}

async fn process_job(job: db::jobs::AnalysisJob) {
    let job_id = job.id;
    let symbol = job.symbol.clone();
    let watchlist_id = job.watchlist_id;
    let attempt = job.retry_count + 1;

    let result: Result<(), String> = async {
        let Some(start) = find_resume_step(job_id).await? else {
            if let Err(e) = save_analysis(job_id, &symbol, watchlist_id).await {
                tracing::warn!(job_id, symbol, "Failed to save analysis: {e}");
            }
            db::jobs::complete(job_id).await.ok();
            broadcast_job(
                job_id,
                &symbol,
                watchlist_id,
                JobStatus::Completed,
                PipelineStep::Done,
                None,
            );
            return Ok(());
        };

        let exchange = db::watchlists::get_exchange(&symbol)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Exchange not found for {symbol}"))?;

        let resume_at = PIPELINE[start];
        db::jobs::set_running(job_id, resume_at).await.ok();
        broadcast_job(
            job_id,
            &symbol,
            watchlist_id,
            JobStatus::Running,
            resume_at,
            None,
        );

        let tv = trading_view().await.map_err(|e| e.to_string())?;

        for (i, &step) in PIPELINE[start..].iter().enumerate() {
            if i > 0 {
                db::jobs::set_step(job_id, step).await.ok();
                broadcast_job(
                    job_id,
                    &symbol,
                    watchlist_id,
                    JobStatus::Running,
                    step,
                    None,
                );
            }
            match step {
                PipelineStep::BasicInfo => {
                    run_step(job_id, step, attempt, || {
                        tv.fetch_basic_info(&exchange, &symbol)
                    })
                    .await
                }
                PipelineStep::Earnings => {
                    run_step(job_id, step, attempt, || {
                        tv.fetch_earnings_data(&exchange, &symbol)
                    })
                    .await
                }
                PipelineStep::Forecast => {
                    run_step(job_id, step, attempt, || {
                        tv.fetch_forecast_data(&exchange, &symbol)
                    })
                    .await
                }
                PipelineStep::Document => {
                    run_step(job_id, step, attempt, || {
                        tv.fetch_earnings_release(&exchange, &symbol)
                    })
                    .await
                }
                _ => Ok(()),
            }?;
        }

        if let Err(e) = save_analysis(job_id, &symbol, watchlist_id).await {
            tracing::warn!(job_id, symbol, "Failed to save analysis: {e}");
        }
        db::jobs::complete(job_id).await.ok();
        broadcast_job(
            job_id,
            &symbol,
            watchlist_id,
            JobStatus::Completed,
            PipelineStep::Done,
            None,
        );
        tracing::info!(job_id, symbol, watchlist_id, "Job completed");
        Ok(())
    }
    .await;

    if let Err(e) = result {
        db::jobs::fail(job_id, &e).await.ok();
        if job.retry_count < MAX_JOB_RETRIES {
            tracing::warn!(job_id, symbol, attempt, "Step failed, requeueing for retry");
            db::jobs::enqueue(&symbol, watchlist_id).await.ok();
            broadcast_job(
                job_id,
                &symbol,
                watchlist_id,
                JobStatus::Pending,
                PipelineStep::Queued,
                None,
            );
        } else {
            tracing::warn!(
                job_id,
                symbol,
                "Job failed permanently after {attempt} attempts: {e}"
            );
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
}

async fn trading_view() -> anyhow::Result<&'static TradingView> {
    static TV: OnceCell<TradingView> = OnceCell::const_new();
    TV.get_or_try_init(TradingView::new).await
}
