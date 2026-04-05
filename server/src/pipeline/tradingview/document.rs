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

        // Scan the most recent card only. Return candidates in priority order:
        // 8-K first, then 10-K. Does NOT click — clicking is done per-attempt
        // so we can fall back if a document turns out to be an external link.
        let candidates: Vec<serde_json::Value> = self
            .page
            .evaluate(
                r#"(function() {
                const cards = Array.from(
                    document.querySelectorAll('article[class*="card-exterior-"]')
                );
                for (let i = 0; i < cards.length; i++) {
                    const card = cards[i];
                    const btns = Array.from(card.querySelectorAll('button'));
                    const date = card.querySelector('[class*="date-"]')
                        ?.childNodes[0]?.textContent?.trim() ?? null;
                    const results = [];
                    if (btns.some(b => b.textContent.includes('8-K')))
                        results.push({ date, formType: '8-K', cardIdx: i });
                    if (btns.some(b => b.textContent.includes('10-K')))
                        results.push({ date, formType: '10-K', cardIdx: i });
                    if (results.length > 0) return results;
                }
                return [];
            })()"#,
            )
            .await
            .context("Failed to evaluate card-scan JS")?
            .into_value::<Vec<serde_json::Value>>()
            .context("Card-scan JS returned non-JSON value")?;

        if candidates.is_empty() {
            bail!("No 8-K or 10-K document found for {exchange}-{symbol}");
        }

        for candidate in &candidates {
            let date_str = candidate["date"]
                .as_str()
                .with_context(|| format!("Missing date in candidate: {candidate}"))?;
            let form_type = candidate["formType"].as_str().unwrap_or("10-K");
            let card_idx = candidate["cardIdx"].as_u64().unwrap_or(0);

            // Click the button for this candidate.
            let clicked: bool = self
                .page
                .evaluate(
                    format!(
                        r#"(function() {{
                    const cards = Array.from(
                        document.querySelectorAll('article[class*="card-exterior-"]')
                    );
                    const card = cards[{card_idx}];
                    if (!card) return false;
                    const btn = Array.from(card.querySelectorAll('button'))
                        .find(b => b.textContent.includes('{form_type}'));
                    if (!btn) return false;
                    btn.click();
                    return true;
                }})()"#
                    )
                    .as_str(),
                )
                .await
                .context("Failed to click document button")?
                .into_value::<bool>()
                .unwrap_or(false);

            if !clicked {
                continue;
            }

            // Wait for the popup to render.
            self.page.sleep().await;

            // Extract the document HTML from the right panel of the popup.
            // [data-name="document-card-popup"] is a stable semantic anchor.
            // The article inside [class*="documentCardLayoutRight-"] holds the body.
            // Returns null if the popup didn't open (e.g. external link doc).
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
                .unwrap_or(None); // treat non-JSON / undefined as no content

            if let Some(html) = content_html {
                let day = NaiveDate::parse_from_str(date_str, "%b %d, %Y")
                    .with_context(|| format!("Failed to parse date \"{date_str}\""))?;
                let earnings_release =
                    htmd::convert(&html).context("Failed to convert document HTML to Markdown")?;
                return Ok(EarningsRelease {
                    day,
                    earnings_release,
                });
            }

            // Popup had no inline content (likely an external link) — dismiss and try next.
            tracing::debug!(
                symbol = %symbol,
                form_type = %form_type,
                "Document is external link, falling back to next candidate"
            );
            self.page
                .evaluate(
                    r#"document.dispatchEvent(
                    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
                )"#,
                )
                .await
                .ok();
            self.page.sleep().await;
        }

        bail!(
            "All document candidates for {exchange}-{symbol} are external links with no inline content"
        );
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
