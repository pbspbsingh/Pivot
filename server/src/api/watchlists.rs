use axum::{Json, extract::Path, http::StatusCode};
use serde::{Deserialize, Serialize};

use crate::{
    api::error::{ApiError, ApiResult},
    db, yfinance,
};

#[derive(Deserialize)]
pub struct CreateBody {
    pub name: String,
    pub emoji: String,
}

#[derive(Deserialize)]
pub struct RenameBody {
    pub name: String,
    pub emoji: String,
}

#[derive(Deserialize)]
pub struct AddStocksBody {
    pub symbols: Vec<String>,
}

#[derive(Serialize)]
pub struct AddStocksResponse {
    added: Vec<String>,
    failed: Vec<String>,
}

pub async fn list() -> ApiResult<impl axum::response::IntoResponse> {
    let watchlists = db::watchlists::list().await?;
    Ok(Json(watchlists))
}

pub async fn create(Json(body): Json<CreateBody>) -> ApiResult<impl axum::response::IntoResponse> {
    if body.name.trim().is_empty() {
        return Err(ApiError::BadRequest("Name cannot be empty".into()));
    }
    let watchlist = db::watchlists::create(body.name.trim(), &body.emoji).await?;
    tracing::info!(id = watchlist.id, name = %watchlist.name, "Watchlist created");
    Ok((StatusCode::CREATED, Json(watchlist)))
}

pub async fn rename(
    Path(id): Path<i64>,
    Json(body): Json<RenameBody>,
) -> ApiResult<impl axum::response::IntoResponse> {
    if body.name.trim().is_empty() {
        return Err(ApiError::BadRequest("Name cannot be empty".into()));
    }
    let watchlist = db::watchlists::get(id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Watchlist not found".into()))?;
    if watchlist.is_default {
        return Err(ApiError::Forbidden(
            "Cannot rename the default watchlist".into(),
        ));
    }
    let updated = db::watchlists::rename(id, body.name.trim(), &body.emoji).await?;
    tracing::info!(id, old_name = %watchlist.name, new_name = %updated.name, "Watchlist renamed");
    Ok(Json(updated))
}

pub async fn delete(Path(id): Path<i64>) -> ApiResult<impl axum::response::IntoResponse> {
    let watchlist = db::watchlists::get(id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Watchlist not found".into()))?;
    if watchlist.is_default {
        return Err(ApiError::Forbidden(
            "Cannot delete the default watchlist".into(),
        ));
    }
    db::watchlists::delete(id).await?;
    tracing::info!(id, name = %watchlist.name, "Watchlist deleted");
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_stocks(Path(id): Path<i64>) -> ApiResult<impl axum::response::IntoResponse> {
    db::watchlists::get(id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Watchlist not found".into()))?;
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
    db::watchlists::get(id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Watchlist not found".into()))?;

    let symbols: Vec<String> = body
        .symbols
        .iter()
        .map(|s| s.trim().to_uppercase())
        .collect();

    // Check DB first; only query Yahoo Finance for symbols not already known.
    let known = db::watchlists::find_exchanges(&symbols).await?;
    let unknown: Vec<String> = symbols
        .iter()
        .filter(|s| !known.contains_key(*s))
        .cloned()
        .collect();

    let fetched = if unknown.is_empty() {
        Default::default()
    } else {
        yfinance::get_exchanges(&unknown).await?
    };

    let mut added = vec![];
    let mut failed = vec![];
    let mut new_stocks = vec![];

    for symbol in &symbols {
        let exchange = known.get(symbol).or_else(|| fetched.get(symbol));
        if let Some(exchange) = exchange {
            new_stocks.push(db::watchlists::NewStock {
                symbol: symbol.clone(),
                exchange: exchange.clone(),
            });
            added.push(symbol.clone());
        } else {
            failed.push(symbol.clone());
        }
    }

    if !new_stocks.is_empty() {
        db::watchlists::add_stocks(id, &new_stocks).await?;
        tracing::info!(watchlist_id = id, added = ?added, "Stocks added to watchlist");
        for symbol in &added {
            if let Err(e) = db::jobs::enqueue(symbol, id).await {
                tracing::warn!(
                    watchlist_id = id,
                    symbol,
                    "Failed to enqueue new stock: {e}"
                );
            }
        }
    }
    if !failed.is_empty() {
        tracing::warn!(watchlist_id = id, failed = ?failed, "Symbols not found on Yahoo Finance");
    }

    Ok(Json(AddStocksResponse { added, failed }))
}

pub async fn delete_stock(
    Path((id, symbol)): Path<(i64, String)>,
) -> ApiResult<impl axum::response::IntoResponse> {
    let symbol = symbol.to_uppercase();
    db::watchlists::soft_delete_stock(id, &symbol).await?;
    tracing::info!(watchlist_id = id, symbol, "Stock removed from watchlist");
    Ok(StatusCode::NO_CONTENT)
}

pub async fn restore_stock(
    Path((id, symbol)): Path<(i64, String)>,
) -> ApiResult<impl axum::response::IntoResponse> {
    let symbol = symbol.to_uppercase();
    db::watchlists::restore_stock(id, &symbol).await?;
    tracing::info!(watchlist_id = id, symbol, "Stock restored in watchlist");
    Ok(StatusCode::NO_CONTENT)
}
