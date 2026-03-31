pub mod jobs;
pub mod pipeline;
pub mod score;

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
pub enum AttemptStatus {
    Success,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum PromptKey {
    Vcp,
    Ep,
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

pub struct NewStock {
    pub symbol: String,
    pub exchange: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Stock {
    pub symbol: String,
    pub exchange: String,
    pub sector: Option<String>,
    pub industry: Option<String>,
    pub analyzed_at: Option<NaiveDateTime>,
}
