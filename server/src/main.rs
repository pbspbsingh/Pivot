mod api;
mod config;
mod db;
mod models;
mod pipeline;
mod sse;
mod utils;
mod yfinance;

use anyhow::Result;
use config::CONFIG;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(&CONFIG.server.log_level)),
        )
        .init();

    db::init(&CONFIG.database.path).await?;
    sse::init();

    let addr = format!("0.0.0.0:{}", CONFIG.server.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Listening on {addr}");
    axum::serve(listener, api::router()).await?;

    Ok(())
}
