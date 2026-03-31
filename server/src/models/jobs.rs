use chrono::NaiveDateTime;
use serde::Serialize;
use sqlx::FromRow;

use crate::models::{JobStatus, PipelineStep};

#[derive(Debug, FromRow)]
pub struct AnalysisJob {
    pub id: i64,
    pub symbol: String,
    pub watchlist_id: i64,
    pub status: JobStatus,
    pub current_step: PipelineStep,
    pub error: Option<String>,
    pub retry_count: i64,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct JobSummary {
    pub job_id: i64,
    pub symbol: String,
    pub watchlist_id: i64,
    pub status: JobStatus,
    pub step: PipelineStep,
    pub error: Option<String>,
}
