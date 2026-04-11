pub mod error;
mod images;
mod jobs;
mod notes;
mod prompts;
mod watchlists;

use axum::{
    Json, Router,
    response::sse::{Event, KeepAlive, Sse},
    routing::{delete, get, patch, post, put},
};
use serde_json::{Value, json};
use std::convert::Infallible;
use tokio_stream::Stream;
use tower_http::cors::CorsLayer;

pub fn router() -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/events", get(events))
        .route(
            "/api/watchlists",
            get(watchlists::list).post(watchlists::create),
        )
        .route("/api/watchlists/reorder", post(watchlists::reorder))
        .route(
            "/api/watchlists/{id}",
            patch(watchlists::rename).delete(watchlists::delete),
        )
        .route(
            "/api/watchlists/{id}/stocks",
            get(watchlists::list_stocks).post(watchlists::add_stocks),
        )
        .route(
            "/api/watchlists/{id}/stocks/{symbol}",
            delete(watchlists::delete_stock),
        )
        .route(
            "/api/watchlists/{id}/stocks/{symbol}/restore",
            post(watchlists::restore_stock),
        )
        .route(
            "/api/watchlists/{id}/stocks/jobs",
            get(jobs::list_watchlist_jobs),
        )
        .route(
            "/api/watchlists/{id}/stocks/{symbol}/analyze",
            post(jobs::enqueue_stock),
        )
        .route(
            "/api/stocks/{symbol}/note",
            get(notes::get).put(notes::save),
        )
        .route("/api/stocks/{symbol}/images", post(images::upload))
        .route("/api/images/{id}", get(images::serve))
        .route("/api/prompts", get(prompts::list))
        .route("/api/prompts/{key}", patch(prompts::update))
        .route("/api/jobs/{job_id}/log", get(jobs::get_job_log))
        .route(
            "/api/watchlists/{id}/stocks/{symbol}/analysis",
            get(jobs::get_stock_analysis),
        )
        .route(
            "/api/watchlists/{id}/stocks/{symbol}/prompt",
            get(jobs::get_prompt_for_stock),
        )
        .route(
            "/api/watchlists/{id}/stocks/{symbol}/score",
            put(jobs::save_score),
        )
        .layer(CorsLayer::permissive())
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

async fn events() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    Sse::new(crate::sse::subscribe().await).keep_alive(KeepAlive::default())
}
