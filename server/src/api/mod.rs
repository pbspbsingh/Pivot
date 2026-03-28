pub mod error;
mod watchlists;

use axum::{
    response::sse::{Event, KeepAlive, Sse},
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::convert::Infallible;
use tokio_stream::Stream;
use tower_http::cors::CorsLayer;

pub fn router() -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/events", get(events))
        .route("/api/watchlists", get(watchlists::list).post(watchlists::create))
        .route("/api/watchlists/{id}", patch(watchlists::rename).delete(watchlists::delete))
        .route("/api/watchlists/{id}/stocks", get(watchlists::list_stocks).post(watchlists::add_stocks))
        .route("/api/watchlists/{id}/stocks/{symbol}", delete(watchlists::delete_stock))
        .route("/api/watchlists/{id}/stocks/{symbol}/restore", post(watchlists::restore_stock))
        .layer(CorsLayer::permissive())
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

async fn events() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    Sse::new(crate::sse::subscribe()).keep_alive(KeepAlive::default())
}
