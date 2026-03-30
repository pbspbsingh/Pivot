use anyhow::Result;
use chrono::NaiveDateTime;
use serde::Serialize;
use sqlx::FromRow;

use crate::{db::pool, models::PromptKey};

const VCP_QUANTITATIVE: &str = include_str!("../../prompts/prompt-vcp-quantitative.md");
const VCP_QUALITATIVE: &str = include_str!("../../prompts/prompt-vcp-qualitative.md");

const EP_QUANTITATIVE: &str = include_str!("../../prompts/prompt-ep-quantitative.md");
const EP_QUALITATIVE: &str = include_str!("../../prompts/prompt-ep-qualitative.md");

#[derive(Debug, Serialize, FromRow)]
pub struct Prompt {
    pub key: PromptKey,
    pub content: String,
    pub updated_at: NaiveDateTime,
}

/// Seeds the 4 prompt rows on first startup. Uses INSERT OR IGNORE so user edits are never
/// overwritten on restart. EP prompts use VCP content as a placeholder until real EP prompts
/// are provided.
pub async fn seed() -> Result<()> {
    let seeds = [
        (PromptKey::VcpQuantitative, VCP_QUANTITATIVE),
        (PromptKey::VcpQualitative, VCP_QUALITATIVE),
        (PromptKey::EpQuantitative, EP_QUANTITATIVE),
        (PromptKey::EpQualitative, EP_QUALITATIVE),
    ];
    for (key, content) in seeds {
        sqlx::query!(
            "INSERT OR IGNORE INTO prompts (key, content) VALUES (?, ?)",
            key,
            content,
        )
        .execute(pool())
        .await?;
    }
    Ok(())
}

pub async fn list() -> Result<Vec<Prompt>> {
    let rows = sqlx::query_as!(
        Prompt,
        r#"SELECT key as "key!: PromptKey", content, updated_at
           FROM prompts
           ORDER BY key"#,
    )
    .fetch_all(pool())
    .await?;
    Ok(rows)
}

pub async fn get(key: PromptKey) -> Result<Option<String>> {
    let row = sqlx::query!(r#"SELECT content FROM prompts WHERE key = ?"#, key,)
        .fetch_optional(pool())
        .await?;
    Ok(row.map(|r| r.content))
}

pub async fn update(key: PromptKey, content: &str) -> Result<()> {
    sqlx::query!(
        "UPDATE prompts SET content = ?, updated_at = datetime('now') WHERE key = ?",
        content,
        key,
    )
    .execute(pool())
    .await?;
    Ok(())
}
