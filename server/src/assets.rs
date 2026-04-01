#[cfg(not(debug_assertions))]
#[derive(rust_embed::Embed)]
#[folder = "../client/dist"]
struct Assets;

#[cfg(not(debug_assertions))]
pub fn router() -> axum::Router {
    use axum::{
        Router,
        body::Body,
        http::{HeaderValue, Response, StatusCode, header},
        response::IntoResponse,
        routing::get,
    };

    async fn serve_asset(uri: axum::http::Uri) -> impl IntoResponse {
        let path = uri.path().trim_start_matches('/');

        // Try exact path first, then fall back to index.html for SPA routing.
        let (data, mime) = if let Some(asset) = Assets::get(path) {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            (asset.data, mime.as_ref().to_string())
        } else if let Some(asset) = Assets::get("index.html") {
            (asset.data, "text/html".to_string())
        } else {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::empty())
                .unwrap();
        };

        Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, HeaderValue::from_str(&mime).unwrap())
            .body(Body::from(data.into_owned()))
            .unwrap()
    }

    Router::new().fallback(get(serve_asset))
}

#[cfg(debug_assertions)]
pub fn router() -> axum::Router {
    axum::Router::new()
}
