const MAX_DIMENSION: u32 = 1920;
const JPEG_QUALITY: u8 = 80;

/// Decodes the image, resizes if needed, and re-encodes as JPEG.
pub fn compress(data: &[u8]) -> anyhow::Result<(Vec<u8>, String)> {
    use image::{ImageReader, imageops::FilterType};
    use std::io::Cursor;

    let img = ImageReader::new(Cursor::new(data))
        .with_guessed_format()?
        .decode()?;

    let img = if img.width() > MAX_DIMENSION || img.height() > MAX_DIMENSION {
        img.resize(MAX_DIMENSION, MAX_DIMENSION, FilterType::Lanczos3)
    } else {
        img
    };

    let mut buf = Vec::new();
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, JPEG_QUALITY);
    img.into_rgb8().write_with_encoder(encoder)?;

    Ok((buf, "image/jpeg".to_string()))
}
