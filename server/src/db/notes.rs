use anyhow::Result;

use crate::db::pool;

pub struct Note {
    pub content: String,
}

pub async fn get(symbol: &str) -> Result<Note> {
    let row = sqlx::query!("SELECT content FROM notes WHERE symbol = ?", symbol)
        .fetch_optional(pool())
        .await?;

    let content = row.map(|r| r.content).unwrap_or_default();
    Ok(Note { content })
}

/// Saves the note content and cleans up orphaned images.
pub async fn upsert(symbol: &str, content: &str) -> Result<()> {
    sqlx::query!(
        "INSERT INTO notes (symbol, content, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(symbol) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
        symbol,
        content,
    )
    .execute(pool())
    .await?;

    // Delete images for this symbol that are no longer referenced in the content.
    let referenced_ids = extract_image_ids(content);
    if referenced_ids.is_empty() {
        sqlx::query!("DELETE FROM note_images WHERE symbol = ?", symbol)
            .execute(pool())
            .await?;
    } else {
        // SQLx doesn't support dynamic IN lists with macros; use a raw query.
        let placeholders = referenced_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let sql =
            format!("DELETE FROM note_images WHERE symbol = ? AND id NOT IN ({placeholders})");
        let mut q = sqlx::query(&sql).bind(symbol);
        for id in &referenced_ids {
            q = q.bind(id);
        }
        q.execute(pool()).await?;
    }

    Ok(())
}

/// Extracts all numeric image IDs from `/api/images/{id}` URLs in the markdown.
fn extract_image_ids(content: &str) -> Vec<i64> {
    let mut ids = Vec::new();
    let prefix = "/api/images/";
    let mut search = content;
    while let Some(pos) = search.find(prefix) {
        let rest = &search[pos + prefix.len()..];
        let end = rest
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(rest.len());
        if end > 0
            && let Ok(id) = rest[..end].parse::<i64>()
        {
            ids.push(id);
        }
        search = &search[pos + prefix.len()..];
    }
    ids
}
