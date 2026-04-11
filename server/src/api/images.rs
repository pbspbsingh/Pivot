use axum::{
    Json,
    body::Bytes,
    extract::{Path, Request},
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
};
use serde::Serialize;

use crate::{
    api::error::{ApiError, ApiResult},
    db,
};

const MAX_UPLOAD_BYTES: usize = 20 * 1024 * 1024; // 20 MB
const MAX_DIMENSION: u32 = 1920;
const JPEG_QUALITY: u8 = 80;

#[derive(Serialize)]
pub struct UploadResponse {
    id: i64,
}

pub async fn upload(
    Path(symbol): Path<String>,
    headers: HeaderMap,
    request: Request,
) -> ApiResult<Json<UploadResponse>> {
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();

    if !content_type.starts_with("image/") {
        return Err(ApiError::BadRequest(
            "content-type must be an image/*".into(),
        ));
    }

    let body = axum::body::to_bytes(request.into_body(), MAX_UPLOAD_BYTES)
        .await
        .map_err(|_| ApiError::BadRequest("image too large (max 20 MB)".into()))?;

    let (compressed, mime) = compress(&body, &content_type)
        .map_err(|e| ApiError::BadRequest(format!("could not process image: {e}")))?;

    let id = db::images::insert(&symbol, &compressed, &mime).await?;
    tracing::info!(
        symbol,
        id,
        original_bytes = body.len(),
        compressed_bytes = compressed.len(),
        "Image uploaded"
    );

    Ok(Json(UploadResponse { id }))
}

pub async fn serve(Path(id): Path<i64>) -> impl IntoResponse {
    match db::images::get(id).await {
        Ok(Some(img)) => (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, img.mime.clone()),
                (
                    header::CACHE_CONTROL,
                    "public, max-age=31536000, immutable".to_string(),
                ),
            ],
            Bytes::from(img.data),
        )
            .into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

/// Decodes the image, resizes if needed, and re-encodes as JPEG.
fn compress(data: &[u8], _content_type: &str) -> anyhow::Result<(Vec<u8>, String)> {
    use image::{ImageReader, imageops::FilterType};
    use std::io::Cursor;

    let img = ImageReader::new(Cursor::new(data))
        .with_guessed_format()?
        .decode()?;

    // Resize if either dimension exceeds the threshold.
    let img = if img.width() > MAX_DIMENSION || img.height() > MAX_DIMENSION {
        img.resize(MAX_DIMENSION, MAX_DIMENSION, FilterType::Lanczos3)
    } else {
        img
    };

    // Encode as JPEG.
    let mut buf = Vec::new();
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, JPEG_QUALITY);
    img.into_rgb8().write_with_encoder(encoder)?;

    Ok((buf, "image/jpeg".to_string()))
}
