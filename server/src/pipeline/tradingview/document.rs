use anyhow::{Context, Result, bail};
use chrome_driver::PageFeatures;
use chrono::NaiveDate;

use crate::models::pipeline::EarningsRelease;

use super::{TV_HOME, TradingView};

impl TradingView {
    /// Fetches the latest earnings document (8-K preferred, 10-K fallback) from
    /// the TradingView documents page and returns its date and markdown content.
    ///
    /// Iterates cards in DOM order (most recent first). Within each card, 8-K is
    /// preferred over 10-K. Clicking the button opens a popup whose right panel
    /// contains the document body, which is converted to Markdown.
    pub async fn fetch_earnings_release(
        &self,
        exchange: &str,
        symbol: &str,
    ) -> Result<EarningsRelease> {
        let url = format!("{TV_HOME}/symbols/{exchange}-{symbol}/documents/?category=earnings");
        self.goto(&url).await?;

        // Scan cards in DOM order (most recent first). Within each card prefer
        // 8-K over 10-K. Click the matching button and return date + form type.
        let info: serde_json::Value = self
            .page
            .evaluate(
                r#"(function() {
                const cards = Array.from(
                    document.querySelectorAll('article[class*="card-exterior-"]')
                );
                for (const card of cards) {
                    const btns = Array.from(card.querySelectorAll('button'));
                    // Prefer 8-K; fall back to 10-K within the same card.
                    const btn = btns.find(b => b.textContent.includes('8-K'))
                               ?? btns.find(b => b.textContent.includes('10-K'));
                    if (!btn) continue;
                    const formType = btn.textContent.includes('8-K') ? '8-K' : '10-K';
                    const date = card.querySelector('[class*="date-"]')
                        ?.childNodes[0]?.textContent?.trim() ?? null;
                    btn.click();
                    return { date, formType };
                }
                return null;
            })()"#,
            )
            .await
            .context("Failed to evaluate card-scan JS")?
            .into_value::<serde_json::Value>()
            .context("Card-scan JS returned non-JSON value")?;

        if info.is_null() {
            bail!("No 8-K or 10-K document found for {exchange}-{symbol}");
        }

        let date_str = info["date"]
            .as_str()
            .with_context(|| format!("Missing date in card info: {info}"))?;
        let form_type = info["formType"].as_str().unwrap_or("10-K");

        let day = NaiveDate::parse_from_str(date_str, "%b %d, %Y")
            .with_context(|| format!("Failed to parse date \"{date_str}\""))?;

        // Wait for the popup to render.
        self.page.sleep().await;

        // Extract the document HTML from the right panel of the popup.
        // [data-name="document-card-popup"] is a stable semantic anchor.
        // The article inside [class*="documentCardLayoutRight-"] holds the body.
        let content_html: Option<String> = self
            .page
            .evaluate(
                r#"(function() {
                const popup = document.querySelector('[data-name="document-card-popup"]');
                if (!popup) return null;
                const right = popup.querySelector('[class*="documentCardLayoutRight-"]');
                const article = right?.querySelector('article');
                return article ? article.innerHTML : null;
            })()"#,
            )
            .await
            .context("Failed to evaluate popup content JS")?
            .into_value()
            .context("Popup content JS returned non-JSON value")?;

        let html = content_html
            .with_context(|| format!("Popup did not open for {form_type} on {date_str}"))?;

        let earnings_release =
            htmd::convert(&html).context("Failed to convert document HTML to Markdown")?;

        Ok(EarningsRelease {
            day,
            earnings_release,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetch_earnings_release() {
        let scraper = TradingView::new()
            .await
            .expect("Failed to initialise TradingViewScraper");

        let release = scraper
            .fetch_earnings_release("NASDAQ", "TSLA")
            .await
            .expect("Failed to fetch earnings release");

        println!("{release:#?}");

        let release = scraper
            .fetch_earnings_release("NASDAQ", "GOOG")
            .await
            .expect("Failed to fetch earnings release");

        println!("{release:#?}");

        let release = scraper
            .fetch_earnings_release("NASDAQ", "AAPL")
            .await
            .expect("Failed to fetch earnings release");

        println!("{release:#?}");
    }
}
