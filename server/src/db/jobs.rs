use anyhow::Result;
use chrono::NaiveDateTime;
use serde::Serialize;
use sqlx::FromRow;
use std::collections::HashMap;

use crate::{
    db::pool,
    models::{JobStatus, PipelineStep},
};

#[derive(Debug, FromRow)]
pub struct AnalysisJob {
    pub id: i64,
    pub symbol: String,
    pub watchlist_id: i64,
    pub status: JobStatus,
    pub current_step: PipelineStep,
    pub error: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Serialize, FromRow)]
pub struct JobSummary {
    pub job_id: i64,
    pub symbol: String,
    pub watchlist_id: i64,
    pub status: JobStatus,
    pub step: PipelineStep,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct StepAttempt {
    pub step: String,
    pub attempt: i64,
    pub status: String,
    pub error: Option<String>,
    pub duration_ms: Option<i64>,
    pub started_at: NaiveDateTime,
}

/// Enqueue a new job for (symbol, watchlist_id).
/// - Returns the existing job if one is already pending or running.
/// - Resets a failed job back to pending so step_data is preserved and resumed.
/// - Creates a new job if none exists or the previous one completed.
pub async fn enqueue(symbol: &str, watchlist_id: i64) -> Result<AnalysisJob> {
    if let Some(job) = get_active(symbol, watchlist_id).await? {
        return Ok(job);
    }
    // Reuse a failed job (reset to pending) so cached step data is preserved.
    if let Some(job) = get_failed(symbol, watchlist_id).await? {
        let job = sqlx::query_as!(
            AnalysisJob,
            r#"UPDATE analysis_jobs
               SET status = 'pending', current_step = 'queued', error = NULL, updated_at = datetime('now')
               WHERE id = ?
               RETURNING id as "id!", symbol as "symbol!", watchlist_id as "watchlist_id!",
                         status as "status!: JobStatus", current_step as "current_step!: PipelineStep",
                         error, created_at as "created_at!", updated_at as "updated_at!""#,
            job.id,
        )
        .fetch_one(pool())
        .await?;
        return Ok(job);
    }
    let job = sqlx::query_as!(
        AnalysisJob,
        r#"INSERT INTO analysis_jobs (symbol, watchlist_id)
           VALUES (?, ?)
           RETURNING id as "id!", symbol as "symbol!", watchlist_id as "watchlist_id!",
                     status as "status!: JobStatus", current_step as "current_step!: PipelineStep",
                     error, created_at as "created_at!", updated_at as "updated_at!""#,
        symbol,
        watchlist_id,
    )
    .fetch_one(pool())
    .await?;
    Ok(job)
}

pub async fn get_latest(symbol: &str, watchlist_id: i64) -> Result<Option<AnalysisJob>> {
    let job = sqlx::query_as!(
        AnalysisJob,
        r#"SELECT id, symbol, watchlist_id,
                  status as "status: JobStatus", current_step as "current_step: PipelineStep",
                  error, created_at, updated_at
           FROM analysis_jobs
           WHERE symbol = ? AND watchlist_id = ?
           ORDER BY id DESC LIMIT 1"#,
        symbol,
        watchlist_id,
    )
    .fetch_optional(pool())
    .await?;
    Ok(job)
}

pub async fn get_failed(symbol: &str, watchlist_id: i64) -> Result<Option<AnalysisJob>> {
    let job = sqlx::query_as!(
        AnalysisJob,
        r#"SELECT id, symbol, watchlist_id,
                  status as "status: JobStatus", current_step as "current_step: PipelineStep",
                  error, created_at, updated_at
           FROM analysis_jobs
           WHERE symbol = ? AND watchlist_id = ? AND status = 'failed'
           ORDER BY id DESC LIMIT 1"#,
        symbol,
        watchlist_id,
    )
    .fetch_optional(pool())
    .await?;
    Ok(job)
}

pub async fn get_active(symbol: &str, watchlist_id: i64) -> Result<Option<AnalysisJob>> {
    let job = sqlx::query_as!(
        AnalysisJob,
        r#"SELECT id, symbol, watchlist_id,
                  status as "status: JobStatus", current_step as "current_step: PipelineStep",
                  error, created_at, updated_at
           FROM analysis_jobs
           WHERE symbol = ? AND watchlist_id = ? AND status IN ('pending', 'running')
           ORDER BY id DESC LIMIT 1"#,
        symbol,
        watchlist_id,
    )
    .fetch_optional(pool())
    .await?;
    Ok(job)
}

pub async fn get_pending() -> Result<Option<AnalysisJob>> {
    let job = sqlx::query_as!(
        AnalysisJob,
        r#"SELECT id, symbol, watchlist_id,
                  status as "status: JobStatus", current_step as "current_step: PipelineStep",
                  error, created_at, updated_at
           FROM analysis_jobs WHERE status = 'pending' ORDER BY id ASC LIMIT 1"#,
    )
    .fetch_optional(pool())
    .await?;
    Ok(job)
}

/// On server startup, reset any jobs left in `running` back to `pending`.
pub async fn reset_running_to_pending() -> Result<()> {
    sqlx::query!(
        "UPDATE analysis_jobs SET status = 'pending', current_step = 'queued', updated_at = datetime('now')
         WHERE status = 'running'"
    )
    .execute(pool())
    .await?;
    Ok(())
}

pub async fn set_running(job_id: i64, step: PipelineStep) -> Result<()> {
    sqlx::query!(
        "UPDATE analysis_jobs SET status = 'running', current_step = ?, updated_at = datetime('now') WHERE id = ?",
        step,
        job_id,
    )
    .execute(pool())
    .await?;
    Ok(())
}

pub async fn set_step(job_id: i64, step: PipelineStep) -> Result<()> {
    sqlx::query!(
        "UPDATE analysis_jobs SET current_step = ?, updated_at = datetime('now') WHERE id = ?",
        step,
        job_id,
    )
    .execute(pool())
    .await?;
    Ok(())
}

pub async fn complete(job_id: i64) -> Result<()> {
    sqlx::query!(
        "UPDATE analysis_jobs SET status = 'completed', current_step = 'done', updated_at = datetime('now') WHERE id = ?",
        job_id,
    )
    .execute(pool())
    .await?;
    Ok(())
}

pub async fn fail(job_id: i64, error: &str) -> Result<()> {
    sqlx::query!(
        "UPDATE analysis_jobs SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?",
        error,
        job_id,
    )
    .execute(pool())
    .await?;
    Ok(())
}

pub async fn get_step_data(job_id: i64, step: PipelineStep) -> Result<Option<serde_json::Value>> {
    let row = sqlx::query!(
        r#"SELECT payload as "payload!: sqlx::types::Json<serde_json::Value>"
           FROM job_step_data WHERE job_id = ? AND step = ?"#,
        job_id,
        step,
    )
    .fetch_optional(pool())
    .await?;
    Ok(row.map(|r| r.payload.0))
}

pub async fn save_step_data(
    job_id: i64,
    step: PipelineStep,
    payload: &serde_json::Value,
) -> Result<()> {
    let wrapped = sqlx::types::Json(payload);
    sqlx::query!(
        "INSERT INTO job_step_data (job_id, step, payload) VALUES (?, ?, ?)
         ON CONFLICT (job_id, step) DO UPDATE SET payload = excluded.payload, saved_at = datetime('now')",
        job_id,
        step,
        wrapped,
    )
    .execute(pool())
    .await?;
    Ok(())
}

pub async fn record_attempt(
    job_id: i64,
    step: PipelineStep,
    attempt: i64,
    success: bool,
    error: Option<&str>,
    duration_ms: Option<i64>,
) -> Result<()> {
    let status = if success { "success" } else { "failed" };
    sqlx::query!(
        "INSERT INTO job_step_attempts (job_id, step, attempt, status, error, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?)",
        job_id,
        step,
        attempt,
        status,
        error,
        duration_ms,
    )
    .execute(pool())
    .await?;
    Ok(())
}

pub async fn list_jobs_for_watchlist(watchlist_id: i64) -> Result<Vec<JobSummary>> {
    let rows = sqlx::query_as!(
        JobSummary,
        r#"SELECT j.id as "job_id!", j.symbol as "symbol!", j.watchlist_id as "watchlist_id!",
                  j.status as "status!: JobStatus", j.current_step as "step!: PipelineStep", j.error
           FROM analysis_jobs j
           INNER JOIN (
               SELECT symbol, MAX(id) as max_id
               FROM analysis_jobs
               WHERE watchlist_id = ?
               GROUP BY symbol
           ) latest ON j.id = latest.max_id"#,
        watchlist_id,
    )
    .fetch_all(pool())
    .await?;
    Ok(rows)
}

pub async fn get_step_avg_durations() -> Result<HashMap<PipelineStep, i64>> {
    let rows = sqlx::query!(
        r#"SELECT step as "step!: PipelineStep", AVG(duration_ms) as "avg_ms: f64"
           FROM job_step_attempts
           WHERE status = 'success' AND duration_ms IS NOT NULL
           GROUP BY step"#,
    )
    .fetch_all(pool())
    .await?;

    Ok(rows
        .into_iter()
        .filter_map(|r| r.avg_ms.map(|ms| (r.step, ms.round() as i64)))
        .collect())
}

pub async fn get_job_log(job_id: i64) -> Result<Vec<StepAttempt>> {
    let rows = sqlx::query_as!(
        StepAttempt,
        r#"SELECT step, attempt, status, error, duration_ms, started_at
           FROM job_step_attempts WHERE job_id = ? ORDER BY id ASC"#,
        job_id,
    )
    .fetch_all(pool())
    .await?;
    Ok(rows)
}
