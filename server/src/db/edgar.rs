use anyhow::{Context, Result};

use crate::db;

pub async fn get_cik(symbol: &str) -> Result<Option<String>> {
    sqlx::query_scalar!("SELECT cik FROM cik_cache WHERE symbol = ?", symbol)
        .fetch_optional(db::pool())
        .await
        .context("Failed to query cik_cache")
}

pub async fn set_cik(symbol: &str, cik: &str) -> Result<()> {
    sqlx::query!(
        "INSERT OR REPLACE INTO cik_cache (symbol, cik) VALUES (?, ?)",
        symbol,
        cik
    )
    .execute(db::pool())
    .await
    .context("Failed to insert into cik_cache")?;
    Ok(())
}
