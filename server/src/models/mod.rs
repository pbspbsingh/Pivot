pub mod pipeline;

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum PipelineStep {
    Queued,
    BasicInfo,
    Earnings,
    Forecast,
    Document,
    Done,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Watchlist {
    pub id: i64,
    pub name: String,
    pub is_default: bool,
    pub emoji: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Stock {
    pub symbol: String,
    pub exchange: String,
    pub sector: Option<String>,
    pub industry: Option<String>,
    pub ep_score: Option<f64>,
    pub vcp_score: Option<f64>,
    pub score_updated_at: Option<NaiveDateTime>,
}
