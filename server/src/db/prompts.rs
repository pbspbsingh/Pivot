use anyhow::Result;
use chrono::NaiveDateTime;
use serde::Serialize;
use sqlx::FromRow;

use crate::{db::pool, models::PromptKey};

const VCP: &str = include_str!("../../prompts/prompt-vcp.md");
const EP: &str = include_str!("../../prompts/prompt-ep.md");

#[derive(Debug, Serialize, FromRow)]
pub struct Prompt {
    pub key: PromptKey,
    pub content: String,
    pub updated_at: NaiveDateTime,
}

/// Seeds the 2 prompt rows on first startup. Uses INSERT OR IGNORE so user edits are never
/// overwritten on restart.
pub async fn seed() -> Result<()> {
    let seeds = [(PromptKey::Vcp, VCP), (PromptKey::Ep, EP)];
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
