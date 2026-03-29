use anyhow::{Context, Result};
use chrome_driver::PageFeatures;

use crate::models::pipeline::StockBasicInfo;

use super::{TV_HOME, TradingView};

impl TradingView {
    /// Fetches basic stock info (description, sector, industry) from the
    /// TradingView symbol overview page.
    pub async fn fetch_basic_info(&self, exchange: &str, symbol: &str) -> Result<StockBasicInfo> {
        let url = format!("{TV_HOME}/symbols/{exchange}-{symbol}/");

        self.page
            .goto(&url)
            .await
            .with_context(|| format!("Failed to navigate to {url}"))?
            .wait_for_navigation()
            .await
            .with_context(|| format!("Page did not finish loading for {url}"))?
            .sleep()
            .await;

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

        Ok(StockBasicInfo {
            sector,
            industry,
            description,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetch_basic_info() {
        let scraper = TradingView::new()
            .await
            .expect("Failed to initialise TradingViewScraper");

        let info = scraper
            .fetch_basic_info("NASDAQ", "TSLA")
            .await
            .expect("Failed to fetch basic info");

        println!("{info:#?}");
    }
}
