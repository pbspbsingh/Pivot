use axum::{Json, extract::Path, http::StatusCode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::{
    api::error::{ApiError, ApiResult},
    db,
    models::{
        PipelineStep,
        jobs::JobSummary,
        pipeline::{EarningsData, EarningsRelease, ForecastData, StockBasicInfo},
    },
};

#[derive(Serialize)]
pub struct WatchlistJobsResponse {
    jobs: Vec<JobSummary>,
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
    pub score: Option<crate::models::score::StockScore>,
    pub analyzed_at: String,
}

#[derive(Deserialize)]
pub struct SaveScoreRequest {
    pub score: f64,
    pub criteria: std::collections::HashMap<String, crate::models::score::CriteriaEntry>,
}

pub async fn save_score(
    Path((watchlist_id, symbol)): Path<(i64, String)>,
    Json(body): Json<SaveScoreRequest>,
) -> ApiResult<impl axum::response::IntoResponse> {
    use chrono::Utc;
    let symbol = symbol.to_uppercase();
    let stock_score = crate::models::score::StockScore {
        score: body.score,
        criteria: body.criteria,
        last_updated: Utc::now().naive_utc(),
    };
    db::analysis::save_score(&symbol, watchlist_id, &stock_score).await?;
    tracing::info!(watchlist_id, symbol, "Score saved via API");
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_prompt_for_stock(
    Path((watchlist_id, symbol)): Path<(i64, String)>,
) -> ApiResult<impl axum::response::IntoResponse> {
    use crate::models::PromptKey;

    let symbol = symbol.to_uppercase();
    let watchlist = db::watchlists::get(watchlist_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Watchlist not found".into()))?;
    let analysis = db::analysis::get(&symbol, watchlist_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("No analysis data yet".into()))?;

    let prompt_key = if watchlist.is_default {
        PromptKey::Ep
    } else {
        PromptKey::Vcp
    };
    let prompt = db::prompts::get(prompt_key)
        .await?
        .ok_or_else(|| ApiError::NotFound("Prompt not found".into()))?;

    let mut input = crate::pipeline::score::build_base_input(&analysis);
    if !watchlist.is_default {
        input["forecast"] =
            serde_json::to_value(&analysis.forecast.0).map_err(|e| ApiError::Internal(e.into()))?;
    }

    let input_json =
        serde_json::to_string_pretty(&input).map_err(|e| ApiError::Internal(e.into()))?;

    // Replace the dummy JSON block under ## INPUT with real data.
    // Search for closing fence only after the opening fence to avoid matching \n``` inside ```json.
    let full_prompt = if let Some(open) = prompt.find("```json\n") {
        let after_open = open + "```json\n".len();
        if let Some(rel_close) = prompt[after_open..].find("\n```") {
            let close = after_open + rel_close;
            let after_close = close + "\n```".len();
            format!(
                "{}```json\n{}\n```{}",
                &prompt[..open],
                input_json,
                &prompt[after_close..]
            )
        } else {
            format!("{}\n\n```json\n{}\n```", prompt, input_json)
        }
    } else {
        format!("{}\n\n```json\n{}\n```", prompt, input_json)
    };

    Ok(axum::response::Response::builder()
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(axum::body::Body::from(full_prompt))
        .map_err(|e| ApiError::Internal(e.into()))?)
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
        score: analysis.score.map(|s| s.0),
        analyzed_at: analysis.analyzed_at.to_string(),
    }))
}
