use axum::{Json, extract::Path, http::StatusCode};
use serde::Serialize;
use std::collections::HashMap;

use crate::{
    api::error::{ApiError, ApiResult},
    db,
    models::{
        PipelineStep,
        pipeline::{EarningsData, EarningsRelease, ForecastData, StockBasicInfo},
    },
};

#[derive(Serialize)]
pub struct WatchlistJobsResponse {
    jobs: Vec<db::jobs::JobSummary>,
    step_avg_ms: HashMap<PipelineStep, i64>,
}

pub async fn list_watchlist_jobs(
    Path(watchlist_id): Path<i64>,
) -> ApiResult<impl axum::response::IntoResponse> {
    db::watchlists::get(watchlist_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Watchlist not found".into()))?;
    let jobs = db::jobs::list_jobs_for_watchlist(watchlist_id).await?;
    let step_avg_ms = db::jobs::get_step_avg_durations().await?;
    Ok(Json(WatchlistJobsResponse { jobs, step_avg_ms }))
}

pub async fn enqueue_stock(
    Path((watchlist_id, symbol)): Path<(i64, String)>,
) -> ApiResult<impl axum::response::IntoResponse> {
    let symbol = symbol.to_uppercase();
    db::watchlists::get(watchlist_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Watchlist not found".into()))?;

    // Verify the stock exists in this watchlist.
    let stocks = db::watchlists::list_stocks(watchlist_id).await?;
    if !stocks.iter().any(|s| s.symbol == symbol) {
        return Err(ApiError::NotFound(format!("{symbol} not in watchlist")));
    }

    let job = db::jobs::enqueue(&symbol, watchlist_id).await?;
    tracing::info!(
        watchlist_id,
        symbol,
        job_id = job.id,
        "Job enqueued via API"
    );
    Ok((StatusCode::ACCEPTED, Json(job.id)))
}

pub async fn get_job_log(Path(job_id): Path<i64>) -> ApiResult<impl axum::response::IntoResponse> {
    let log = db::jobs::get_job_log(job_id).await?;
    Ok(Json(log))
}

#[derive(Serialize)]
pub struct StockAnalysisResponse {
    pub exchange: String,
    pub basic_info: StockBasicInfo,
    pub earnings: EarningsData,
    pub forecast: Option<ForecastData>,
    pub document: EarningsRelease,
    pub analyzed_at: String,
}

pub async fn get_stock_analysis(
    Path((watchlist_id, symbol)): Path<(i64, String)>,
) -> ApiResult<impl axum::response::IntoResponse> {
    let symbol = symbol.to_uppercase();
    let exchange = db::watchlists::get_exchange(&symbol)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("{symbol} not found")))?;
    let analysis = db::analysis::get(&symbol, watchlist_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("No analysis data yet".into()))?;
    Ok(Json(StockAnalysisResponse {
        exchange,
        basic_info: analysis.basic_info.0,
        earnings: analysis.earnings.0,
        forecast: analysis.forecast.0,
        document: analysis.document.0,
        analyzed_at: analysis.analyzed_at.to_string(),
    }))
}
