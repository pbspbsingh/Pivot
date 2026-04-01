use anyhow::Result;
use chrono::NaiveDateTime;
use sqlx::{FromRow, types::Json};

use crate::{
    db::pool,
    models::{
        pipeline::{EarningsData, EarningsRelease, ForecastData, StockBasicInfo},
        score::StockScore,
    },
};

#[derive(Debug, FromRow)]
pub struct StockAnalysis {
    pub symbol: String,
    pub watchlist_id: i64,
    pub basic_info: Json<StockBasicInfo>,
    pub earnings: Json<EarningsData>,
    pub forecast: Json<Option<ForecastData>>,
    pub document: Json<EarningsRelease>,
    pub score: Option<Json<StockScore>>,
    pub analyzed_at: NaiveDateTime,
}

pub async fn upsert(
    symbol: &str,
    watchlist_id: i64,
    basic_info: &StockBasicInfo,
    earnings: &EarningsData,
    forecast: Option<&ForecastData>,
    document: &EarningsRelease,
) -> Result<()> {
    let bi = Json(basic_info);
    let ea = Json(earnings);
    let fo = Json(forecast);
    let doc = Json(document);
    sqlx::query!(
        "INSERT INTO stock_analysis (symbol, watchlist_id, basic_info, earnings, forecast, document)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (symbol, watchlist_id) DO UPDATE SET
             basic_info  = excluded.basic_info,
             earnings    = excluded.earnings,
             forecast    = excluded.forecast,
             document    = excluded.document,
             analyzed_at = datetime('now')",
        symbol,
        watchlist_id,
        bi,
        ea,
        fo,
        doc,
    )
    .execute(pool())
    .await?;
    Ok(())
}

pub async fn save_score(symbol: &str, watchlist_id: i64, score: &StockScore) -> Result<()> {
    let sc = Json(score);
    sqlx::query!(
        "UPDATE stock_analysis SET score = ? WHERE symbol = ? AND watchlist_id = ?",
        sc,
        symbol,
        watchlist_id,
    )
    .execute(pool())
    .await?;
    Ok(())
}

pub async fn get(symbol: &str, watchlist_id: i64) -> Result<Option<StockAnalysis>> {
    let row = sqlx::query_as!(
        StockAnalysis,
        r#"SELECT symbol, watchlist_id,
                  basic_info as "basic_info: Json<StockBasicInfo>",
                  earnings   as "earnings: Json<EarningsData>",
                  forecast   as "forecast: Json<Option<ForecastData>>",
                  document   as "document: Json<EarningsRelease>",
                  score      as "score: Json<StockScore>",
                  analyzed_at
           FROM stock_analysis
           WHERE symbol = ? AND watchlist_id = ?"#,
        symbol,
        watchlist_id,
    )
    .fetch_optional(pool())
    .await?;
    Ok(row)
}
