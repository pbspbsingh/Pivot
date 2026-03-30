use axum::{Json, extract::Path, http::StatusCode};
use serde::Deserialize;

use crate::{
    api::error::{ApiError, ApiResult},
    db,
    models::PromptKey,
};

#[derive(Deserialize)]
pub struct UpdatePromptBody {
    content: String,
}

pub async fn list() -> ApiResult<impl axum::response::IntoResponse> {
    let prompts = db::prompts::list().await?;
    Ok(Json(prompts))
}

pub async fn update(
    Path(key): Path<PromptKey>,
    Json(body): Json<UpdatePromptBody>,
) -> ApiResult<impl axum::response::IntoResponse> {
    if body.content.trim().is_empty() {
        return Err(ApiError::BadRequest("content cannot be empty".into()));
    }
    db::prompts::update(key, &body.content).await?;
    tracing::info!(?key, "Prompt updated");
    Ok(StatusCode::NO_CONTENT)
}
