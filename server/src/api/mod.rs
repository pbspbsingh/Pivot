use axum::{routing::get, Json, Router};
use serde_json::{json, Value};
use tower_http::cors::CorsLayer;

pub fn router() -> Router {
    Router::new()
        .route("/api/health", get(health))
        .layer(CorsLayer::permissive())
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}
