use anyhow::{Context, Result};
use chrome_driver::{
    Browser, ChromeDriverConfig, Page,
    chromiumoxide::cdp::browser_protocol::target::CloseTargetParams,
};

use crate::{config::CONFIG, models::pipeline::StockBasicInfo};

const TV_HOME: &str = "https://www.tradingview.com/";

pub struct TradingViewScraper {
    _browser: Browser,
    page: Page,
}

impl TradingViewScraper {
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

    /// Fetches basic stock info (description, sector, industry) from the
    /// TradingView symbol overview page.
    pub async fn fetch_basic_info(&self, exchange: &str, symbol: &str) -> Result<StockBasicInfo> {
        let url = format!("https://www.tradingview.com/symbols/{exchange}-{symbol}/");

        self.page
            .goto(&url)
            .await
            .with_context(|| format!("Failed to navigate to {url}"))?;

        self.page
            .wait_for_navigation()
            .await
            .with_context(|| format!("Page did not finish loading for {url}"))?;

        // Business description sits in an element styled with the custom CSS
        // property --business-description-row-height, which is a semantic
        // marker unlikely to change across redesigns.
        let description = self
            .page
            .evaluate(
                "document.querySelector('[style*=\"--business-description-row-height\"]')?.innerText?.trim() ?? null",
            )
            .await
            .context("Failed to query business description element")?
            .into_value::<Option<String>>()
            .context("Description value is not a string")?;

        // Sector and industry are in breadcrumb links whose href contains
        // "sectorandindustry-sector" / "sectorandindustry-industry".
        // These are semantic URL patterns stable across TradingView redesigns.
        let sector = self
            .page
            .evaluate(
                "document.querySelector('a[href*=\"sectorandindustry-sector\"]')?.innerText?.trim() ?? null",
            )
            .await
            .context("Failed to query sector element")?
            .into_value::<Option<String>>()
            .context("Sector value is not a string")?
            .ok_or_else(|| anyhow::anyhow!("Sector not found for {symbol} — TradingView page structure may have changed"))?;

        let industry = self
            .page
            .evaluate(
                "document.querySelector('a[href*=\"sectorandindustry-industry\"]')?.innerText?.trim() ?? null",
            )
            .await
            .context("Failed to query industry element")?
            .into_value::<Option<String>>()
            .context("Industry value is not a string")?
            .ok_or_else(|| anyhow::anyhow!("Industry not found for {symbol} — TradingView page structure may have changed"))?;

        Ok(StockBasicInfo {
            description,
            sector,
            industry,
        })
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetch_basic_info() {
        let scraper = TradingViewScraper::new()
            .await
            .expect("Failed to initialise TradingViewScraper");

        let info = scraper
            .fetch_basic_info("NASDAQ", "NVDA")
            .await
            .expect("Failed to fetch basic info");

        println!("{info:#?}");
    }
}
