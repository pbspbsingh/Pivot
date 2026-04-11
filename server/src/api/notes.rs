use axum::{Json, extract::Path};
use serde::{Deserialize, Serialize};

use crate::{api::error::ApiResult, db, markdown};

#[derive(Serialize)]
pub struct NoteResponse {
    content: String,
    html: String,
}

#[derive(Serialize)]
pub struct SaveNoteResponse {
    html: String,
}

#[derive(Deserialize)]
pub struct SaveNoteBody {
    content: String,
}

pub async fn get(Path(symbol): Path<String>) -> ApiResult<Json<NoteResponse>> {
    let note = db::notes::get(&symbol).await?;
    Ok(Json(NoteResponse {
        html: markdown::render(&note.content),
        content: note.content,
    }))
}

pub async fn save(
    Path(symbol): Path<String>,
    Json(body): Json<SaveNoteBody>,
) -> ApiResult<Json<SaveNoteResponse>> {
    db::notes::upsert(&symbol, &body.content).await?;
    tracing::info!(symbol, "Note saved");
    Ok(Json(SaveNoteResponse {
        html: markdown::render(&body.content),
    }))
}
