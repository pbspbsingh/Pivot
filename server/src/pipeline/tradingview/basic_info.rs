use crate::models::pipeline::StockBasicInfo;
use anyhow::{Context, Result};
use tracing::warn;

use super::{TV_HOME, TradingView};

impl TradingView {
    /// Fetches basic stock info (description, sector, industry) from the
    /// TradingView symbol overview page.
    pub async fn fetch_basic_info(
        &mut self,
        exchange: &str,
        symbol: &str,
    ) -> Result<StockBasicInfo> {
        let url = format!("{TV_HOME}/symbols/{exchange}-{symbol}/");

        self.goto(&url).await?;

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

        let description = match self
            .page
            .find_element(r#"div[data-container-name="company-info-id"] div[class*="blockText-"]"#)
            .await
        {
            Ok(div) => div.inner_text().await?,
            Err(_) => {
                warn!("{symbol}'s description couldn't be found");
                None
            }
        };

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
        let mut scraper = TradingView::new()
            .await
            .expect("Failed to initialise TradingViewScraper");

        let info = scraper
            .fetch_basic_info("NASDAQ", "TSLA")
            .await
            .expect("Failed to fetch basic info");

        println!("{info:#?}");
    }
}
