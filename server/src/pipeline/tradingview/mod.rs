mod basic_info;
mod document;
mod earnings;
mod forecast;

use anyhow::{Context, Result};
use chrome_driver::{
    Browser, ChromeDriverConfig, Page, PageFeatures,
    chromiumoxide::cdp::browser_protocol::target::CloseTargetParams,
};

use crate::config::CONFIG;

const TV_HOME: &str = "https://www.tradingview.com";

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

    async fn goto(&self, url: impl AsRef<str>) -> Result<()> {
        let url = url.as_ref();
        self.page
            .goto(url)
            .await
            .with_context(|| format!("Failed to navigate to {url}"))?
            .wait_for_navigation()
            .await
            .with_context(|| format!("Page did not finish loading for {url}"))?
            .sleep()
            .await;

        self.try_close_popup().await?;

        Ok(())
    }

    async fn try_close_popup(&self) -> Result<()> {
        if let Ok(close_btn) = self
            .page
            .find_element("button[data-qa-id='promo-dialog-close-button']")
            .await
        {
            close_btn.click().await?;
        }
        Ok(())
    }
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

async fn connect_browser() -> Result<Browser> {
    let cfg = &CONFIG.chrome;
    let mut builder = ChromeDriverConfig::new(&cfg.binary).launch_if_needed(cfg.launch_if_needed);
    if let Some(dir) = &cfg.user_data_dir {
        builder = builder.user_data_dir(dir);
    }
    builder
        .args(&cfg.extra_args)
        .connect()
        .await
        .context("Failed to connect to Chrome")
}
