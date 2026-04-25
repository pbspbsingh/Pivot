use anyhow::{Context, Result};
use tokio::time::{Duration, sleep};

use crate::models::NewStock;

use super::TradingView;

const POLL_INTERVAL: Duration = Duration::from_millis(500);
const POLL_TIMEOUT: Duration = Duration::from_secs(15);

impl TradingView {
    /// Scrapes a TradingView screener page and returns the stocks listed in the
    /// table. Parses exchange and ticker from the symbol page link in each row.
    pub async fn fetch_watchlist_tickers(&mut self, url: &str) -> Result<Vec<NewStock>> {
        self.goto(url).await?;

        // Screener rows are rendered client-side — poll until they appear.
        let deadline = tokio::time::Instant::now() + POLL_TIMEOUT;
        loop {
            let ready = self
                .page
                .evaluate("document.querySelector('.listRow') !== null")
                .await
                .and_then(|v| Ok(v.into_value::<bool>()?))
                .unwrap_or(false);

            if ready {
                break;
            }
            if tokio::time::Instant::now() >= deadline {
                anyhow::bail!("Timed out waiting for screener rows to render at {url}");
            }
            sleep(POLL_INTERVAL).await;
        }

        let rows = self
            .page
            .evaluate(
                r#"Array.from(document.querySelectorAll('.listRow[data-rowkey]'))
                    .map(row => {
                        const [exchange, symbol] = row.dataset.rowkey.split(':');
                        return exchange && symbol ? { exchange, symbol } : null;
                    })
                    .filter(Boolean)"#,
            )
            .await
            .context("Failed to evaluate screener tickers JS")?
            .into_value::<Vec<serde_json::Value>>()
            .context("Screener tickers JS did not return an array")?;

        let stocks = rows
            .into_iter()
            .filter_map(|v| {
                let symbol = v["symbol"].as_str()?.to_uppercase();
                let exchange = v["exchange"].as_str()?.to_uppercase();
                if symbol.is_empty() || exchange.is_empty() {
                    return None;
                }
                Some(NewStock { symbol, exchange })
            })
            .collect();

        Ok(stocks)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetch_watchlist_tickers() {
        let mut scraper = TradingView::new()
            .await
            .expect("Failed to initialise TradingView");

        let stocks = scraper
            .fetch_watchlist_tickers("https://www.tradingview.com/screener/zoPlhir2/")
            .await
            .expect("Failed to fetch tickers");

        println!("Found {} stocks: {stocks:#?}", stocks.len());
        assert!(!stocks.is_empty(), "Expected at least one stock");
    }
}
