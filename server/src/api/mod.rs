use axum::{
    Json, Router,
    response::sse::{Event, KeepAlive, Sse},
    routing::get,
};
use serde_json::{Value, json};
use std::convert::Infallible;
use tokio_stream::Stream;
use tower_http::cors::CorsLayer;

pub fn router() -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/events", get(events))
        .layer(CorsLayer::permissive())
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

async fn events() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    Sse::new(crate::sse::subscribe()).keep_alive(KeepAlive::default())
}
