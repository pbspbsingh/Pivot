use axum::{
    extract::Path,
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use crate::{api::error::{ApiError, ApiResult}, db};

#[derive(Deserialize)]
pub struct CreateBody {
    pub name: String,
}

#[derive(Deserialize)]
pub struct RenameBody {
    pub name: String,
}

#[derive(Deserialize)]
pub struct AddStocksBody {
    pub symbols: Vec<String>,
}

pub async fn list() -> ApiResult<impl axum::response::IntoResponse> {
    let watchlists = db::watchlists::list().await?;
    Ok(Json(watchlists))
}

pub async fn create(Json(body): Json<CreateBody>) -> ApiResult<impl axum::response::IntoResponse> {
    if body.name.trim().is_empty() {
        return Err(ApiError::BadRequest("Name cannot be empty".into()));
    }
    let watchlist = db::watchlists::create(body.name.trim()).await?;
    Ok((StatusCode::CREATED, Json(watchlist)))
}

pub async fn rename(
    Path(id): Path<i64>,
    Json(body): Json<RenameBody>,
) -> ApiResult<impl axum::response::IntoResponse> {
    if body.name.trim().is_empty() {
        return Err(ApiError::BadRequest("Name cannot be empty".into()));
    }
    let watchlist = db::watchlists::get(id).await?.ok_or_else(|| ApiError::NotFound("Watchlist not found".into()))?;
    if watchlist.is_default {
        return Err(ApiError::Forbidden("Cannot rename the default watchlist".into()));
    }
    let updated = db::watchlists::rename(id, body.name.trim()).await?;
    Ok(Json(updated))
}

pub async fn delete(Path(id): Path<i64>) -> ApiResult<impl axum::response::IntoResponse> {
    let watchlist = db::watchlists::get(id).await?.ok_or_else(|| ApiError::NotFound("Watchlist not found".into()))?;
    if watchlist.is_default {
        return Err(ApiError::Forbidden("Cannot delete the default watchlist".into()));
    }
    db::watchlists::delete(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_stocks(Path(id): Path<i64>) -> ApiResult<impl axum::response::IntoResponse> {
    db::watchlists::get(id).await?.ok_or_else(|| ApiError::NotFound("Watchlist not found".into()))?;
    let stocks = db::watchlists::list_stocks(id).await?;
    Ok(Json(stocks))
}

pub async fn add_stocks(
    Path(id): Path<i64>,
    Json(body): Json<AddStocksBody>,
) -> ApiResult<impl axum::response::IntoResponse> {
    if body.symbols.is_empty() {
        return Err(ApiError::BadRequest("No symbols provided".into()));
    }
    db::watchlists::get(id).await?.ok_or_else(|| ApiError::NotFound("Watchlist not found".into()))?;
    db::watchlists::add_stocks(id, &body.symbols).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_stock(Path((id, symbol)): Path<(i64, String)>) -> ApiResult<impl axum::response::IntoResponse> {
    db::watchlists::soft_delete_stock(id, &symbol.to_uppercase()).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn restore_stock(Path((id, symbol)): Path<(i64, String)>) -> ApiResult<impl axum::response::IntoResponse> {
    db::watchlists::restore_stock(id, &symbol.to_uppercase()).await?;
    Ok(StatusCode::NO_CONTENT)
}
