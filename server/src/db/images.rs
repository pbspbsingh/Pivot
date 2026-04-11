use anyhow::Result;

use crate::db::pool;

pub struct ImageRow {
    pub data: Vec<u8>,
    pub mime: String,
}

pub async fn insert(symbol: &str, data: &[u8], mime: &str) -> Result<i64> {
    let row = sqlx::query!(
        "INSERT INTO note_images (symbol, data, mime) VALUES (?, ?, ?) RETURNING id",
        symbol,
        data,
        mime,
    )
    .fetch_one(pool())
    .await?;
    Ok(row.id)
}

pub async fn get(id: i64) -> Result<Option<ImageRow>> {
    let row = sqlx::query!("SELECT data, mime FROM note_images WHERE id = ?", id)
        .fetch_optional(pool())
        .await?;
    Ok(row.map(|r| ImageRow {
        data: r.data,
        mime: r.mime,
    }))
}
