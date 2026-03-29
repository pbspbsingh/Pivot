mod basic_info;
mod earnings;
mod forecast;

use anyhow::{Context, Result};
use chrome_driver::{
    Browser, ChromeDriverConfig, Page,
    chromiumoxide::cdp::browser_protocol::target::CloseTargetParams,
};

use crate::config::CONFIG;

pub(super) const TV_HOME: &str = "https://www.tradingview.com";

pub struct TradingView {
    _browser: Browser,
    page: Page,
}

impl TradingView {
    pub async fn new() -> Result<Self> {
        let mut browser = connect_browser().await?;

        let targets = browser
            .fetch_targets()
            .await
            .context("Failed to fetch browser targets")?;
        for target in targets {
            if target.r#type == "page" && target.url.starts_with(TV_HOME) {
                tracing::debug!("Closing existing TradingView tab: {}", target.url);
                browser
                    .execute(CloseTargetParams::new(target.target_id))
                    .await
                    .with_context(|| format!("Failed to close tab: {}", target.url))?;
            }
        }

        let page = browser
            .new_page(TV_HOME)
            .await
            .context("Failed to open new TradingView tab")?;

        Ok(Self {
            _browser: browser,
            page,
        })
    }
}

pub(super) fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

async fn connect_browser() -> Result<Browser> {
    let cfg = &CONFIG.chrome;
    let mut builder = ChromeDriverConfig::new(&cfg.binary).launch_if_needed(cfg.launch_if_needed);
    if let Some(dir) = &cfg.user_data_dir {
        builder = builder.user_data_dir(dir);
    }
    builder
        .connect()
        .await
        .context("Failed to connect to Chrome")
}
