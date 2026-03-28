use anyhow::Result;

use crate::{db::pool, models::{Stock, Watchlist}};

pub async fn list() -> Result<Vec<Watchlist>> {
    let rows = sqlx::query_as!(
        Watchlist,
        r#"SELECT id, name, is_default FROM watchlists ORDER BY is_default DESC, name ASC"#
    )
    .fetch_all(pool())
    .await?;
    Ok(rows)
}

pub async fn get(id: i64) -> Result<Option<Watchlist>> {
    let row = sqlx::query_as!(
        Watchlist,
        r#"SELECT id, name, is_default FROM watchlists WHERE id = ?"#,
        id
    )
    .fetch_optional(pool())
    .await?;
    Ok(row)
}

pub async fn create(name: &str) -> Result<Watchlist> {
    let row = sqlx::query_as!(
        Watchlist,
        r#"INSERT INTO watchlists (name) VALUES (?) RETURNING id, name, is_default"#,
        name
    )
    .fetch_one(pool())
    .await?;
    Ok(row)
}

pub async fn rename(id: i64, name: &str) -> Result<Watchlist> {
    let row = sqlx::query_as!(
        Watchlist,
        r#"UPDATE watchlists SET name = ? WHERE id = ? RETURNING id, name, is_default"#,
        name,
        id
    )
    .fetch_one(pool())
    .await?;
    Ok(row)
}

pub async fn delete(id: i64) -> Result<()> {
    sqlx::query!("DELETE FROM watchlists WHERE id = ?", id)
        .execute(pool())
        .await?;
    Ok(())
}

pub async fn list_stocks(watchlist_id: i64) -> Result<Vec<Stock>> {
    let rows = sqlx::query_as!(
        Stock,
        r#"
        SELECT s.symbol as "symbol!", s.sector, s.industry, s.ep_score, s.vcp_score, s.score_updated_at
        FROM watchlist_stocks ws
        JOIN stocks s ON s.symbol = ws.symbol
        WHERE ws.watchlist_id = ? AND ws.deleted_at IS NULL
        ORDER BY s.symbol ASC
        "#,
        watchlist_id
    )
    .fetch_all(pool())
    .await?;
    Ok(rows)
}

pub async fn add_stocks(watchlist_id: i64, symbols: &[String]) -> Result<()> {
    let mut tx = pool().begin().await?;

    for symbol in symbols {
        let symbol = symbol.trim().to_uppercase();
        sqlx::query!("INSERT OR IGNORE INTO stocks (symbol) VALUES (?)", symbol)
            .execute(&mut *tx)
            .await?;

        sqlx::query!(
            "INSERT INTO watchlist_stocks (watchlist_id, symbol)
             VALUES (?, ?)
             ON CONFLICT (watchlist_id, symbol) DO UPDATE SET deleted_at = NULL",
            watchlist_id,
            symbol
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn soft_delete_stock(watchlist_id: i64, symbol: &str) -> Result<()> {
    sqlx::query!(
        "UPDATE watchlist_stocks SET deleted_at = datetime('now') WHERE watchlist_id = ? AND symbol = ?",
        watchlist_id,
        symbol
    )
    .execute(pool())
    .await?;
    Ok(())
}

pub async fn restore_stock(watchlist_id: i64, symbol: &str) -> Result<()> {
    sqlx::query!(
        "UPDATE watchlist_stocks SET deleted_at = NULL WHERE watchlist_id = ? AND symbol = ?",
        watchlist_id,
        symbol
    )
    .execute(pool())
    .await?;
    Ok(())
}
