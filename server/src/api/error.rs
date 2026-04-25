use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

pub type ApiResult<T> = Result<T, ApiError>;

pub enum ApiError {
    NotFound(String),
    BadRequest(String),
    Forbidden(String),
    Conflict(String),
    Internal(anyhow::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg),
            ApiError::Conflict(msg) => (StatusCode::CONFLICT, msg),
            ApiError::Internal(e) => {
                tracing::error!("Internal error: {e:#}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".into(),
                )
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        ApiError::Internal(e)
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => ApiError::NotFound("Not found".into()),
            _ => ApiError::Internal(e.into()),
        }
    }
}
