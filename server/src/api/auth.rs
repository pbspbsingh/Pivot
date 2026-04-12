use axum::{
    Json,
    body::Body,
    http::{Request, StatusCode, header::SET_COOKIE},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde::Deserialize;

use crate::config::CONFIG;

#[derive(Deserialize)]
pub struct LoginRequest {
    token: String,
}

pub async fn login(Json(body): Json<LoginRequest>) -> Response {
    if body.token != CONFIG.server.auth_token {
        return StatusCode::UNAUTHORIZED.into_response();
    }

    let cookie = format!(
        "token={}; HttpOnly; SameSite=Strict; Path=/",
        CONFIG.server.auth_token
    );

    Response::builder()
        .status(StatusCode::OK)
        .header(SET_COOKIE, cookie)
        .body(Body::empty())
        .unwrap()
}

pub async fn logout() -> Response {
    Response::builder()
        .status(StatusCode::OK)
        .header(
            SET_COOKIE,
            "token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        )
        .body(Body::empty())
        .unwrap()
}

pub async fn auth_middleware(request: Request<Body>, next: Next) -> Response {
    let path = request.uri().path();
    if path == "/api/health" || path == "/api/auth/login" {
        return next.run(request).await;
    }

    let token = request
        .headers()
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| {
            s.split(';')
                .find_map(|part| part.trim().strip_prefix("token="))
        });

    match token {
        Some(t) if t == CONFIG.server.auth_token => next.run(request).await,
        _ => StatusCode::UNAUTHORIZED.into_response(),
    }
}
