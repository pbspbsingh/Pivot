use chrono::NaiveDateTime;
use serde::Serialize;
use sqlx::FromRow;

#[derive(Debug, Serialize, FromRow)]
pub struct Watchlist {
    pub id: i64,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Stock {
    pub symbol: String,
    pub sector: Option<String>,
    pub industry: Option<String>,
    pub ep_score: Option<f64>,
    pub vcp_score: Option<f64>,
    pub score_updated_at: Option<NaiveDateTime>,
}
