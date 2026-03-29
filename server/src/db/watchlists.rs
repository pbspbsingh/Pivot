use anyhow::Result;

use crate::{
    db::pool,
    models::{Stock, Watchlist},
};

pub struct NewStock {
    pub symbol: String,
    pub exchange: String,
}

pub async fn list() -> Result<Vec<Watchlist>> {
    let rows = sqlx::query_as!(
        Watchlist,
        r#"SELECT id, name, is_default, emoji FROM watchlists ORDER BY is_default DESC, created_at ASC"#
    )
    .fetch_all(pool())
    .await?;
    Ok(rows)
}

pub async fn get(id: i64) -> Result<Option<Watchlist>> {
    let row = sqlx::query_as!(
        Watchlist,
        r#"SELECT id, name, is_default, emoji FROM watchlists WHERE id = ?"#,
        id
    )
    .fetch_optional(pool())
    .await?;
    Ok(row)
}

pub async fn create(name: &str, emoji: &str) -> Result<Watchlist> {
    let row = sqlx::query_as!(
        Watchlist,
        r#"INSERT INTO watchlists (name, emoji) VALUES (?, ?) RETURNING id, name, is_default, emoji"#,
        name,
        emoji
    )
    .fetch_one(pool())
    .await?;
    Ok(row)
}

pub async fn rename(id: i64, name: &str, emoji: &str) -> Result<Watchlist> {
    let row = sqlx::query_as!(
        Watchlist,
        r#"UPDATE watchlists SET name = ?, emoji = ? WHERE id = ? RETURNING id, name, is_default, emoji"#,
        name,
        emoji,
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
            SELECT
                s.symbol as "symbol!",
                s.exchange as "exchange!",
                -- Use ->> to get unquoted text directly
                (sa.basic_info ->> '$.sector') as "sector?: String",
                (sa.basic_info ->> '$.industry') as "industry?: String",
                -- Added '?' because this comes from a LEFT JOIN and can be NULL
                sa.analyzed_at as "analyzed_at?"
            FROM watchlist_stocks ws
            JOIN stocks s ON s.symbol = ws.symbol
            LEFT JOIN stock_analysis sa
                ON sa.symbol = ws.symbol
                AND sa.watchlist_id = ws.watchlist_id
            WHERE ws.watchlist_id = ?
              AND ws.deleted_at IS NULL
            ORDER BY s.symbol ASC
       "#,
        watchlist_id
    )
    .fetch_all(pool())
    .await?;
    Ok(rows)
}

/// Returns exchange names for symbols that already exist in the stocks table.
pub async fn find_exchanges(
    symbols: &[String],
) -> Result<std::collections::HashMap<String, String>> {
    if symbols.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    // sqlx doesn't support dynamic IN lists with macros, so build it manually.
    let placeholders = symbols.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let query = format!("SELECT symbol, exchange FROM stocks WHERE symbol IN ({placeholders})");
    let mut q = sqlx::query(&query);
    for sym in symbols {
        q = q.bind(sym);
    }

    let rows = q.fetch_all(pool()).await?;
    let map = rows
        .into_iter()
        .map(|r| {
            use sqlx::Row;
            (r.get::<String, _>("symbol"), r.get::<String, _>("exchange"))
        })
        .collect();
    Ok(map)
}

pub async fn add_stocks(watchlist_id: i64, stocks: &[NewStock]) -> Result<()> {
    let mut tx = pool().begin().await?;

    for stock in stocks {
        sqlx::query!(
            "INSERT INTO stocks (symbol, exchange) VALUES (?, ?)
             ON CONFLICT (symbol) DO NOTHING",
            stock.symbol,
            stock.exchange
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query!(
            "INSERT INTO watchlist_stocks (watchlist_id, symbol)
             VALUES (?, ?)
             ON CONFLICT (watchlist_id, symbol) DO UPDATE SET deleted_at = NULL",
            watchlist_id,
            stock.symbol
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

/// Returns (symbol, watchlist_id) for every non-deleted stock across all watchlists.
/// Used by the queue worker on startup to enqueue all active tickers.
pub async fn list_all_active_stocks() -> Result<Vec<(String, i64)>> {
    let rows =
        sqlx::query!("SELECT symbol, watchlist_id FROM watchlist_stocks WHERE deleted_at IS NULL")
            .fetch_all(pool())
            .await?;
    Ok(rows
        .into_iter()
        .map(|r| (r.symbol, r.watchlist_id))
        .collect())
}

pub async fn get_exchange(symbol: &str) -> Result<Option<String>> {
    let row = sqlx::query!("SELECT exchange FROM stocks WHERE symbol = ?", symbol)
        .fetch_optional(pool())
        .await?;
    Ok(row.map(|r| r.exchange))
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
