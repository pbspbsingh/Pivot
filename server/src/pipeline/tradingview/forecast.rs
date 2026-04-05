use crate::models::pipeline::ForecastData;
use anyhow::{Context, Result};
use tracing::warn;

use super::{TV_HOME, TradingView, round2};

impl TradingView {
    /// Fetches price target and analyst ratings from the TradingView forecast page.
    pub async fn fetch_forecast_data(
        &self,
        exchange: &str,
        symbol: &str,
    ) -> Result<Option<ForecastData>> {
        let forecast_url = format!("{TV_HOME}/symbols/{exchange}-{symbol}/forecast/");
        self.goto(&forecast_url).await?;

        let forecast_raw = match self.evaluate_forecast_js().await {
            Ok(forecast) => forecast,
            Err(_) => {
                warn!(
                    "Failed to evaluate forecast JS, most likely forecast doesn't exist for '{exchange}:{symbol}'"
                );
                return Ok(None);
            }
        };

        if forecast_raw.is_null() {
            warn!("Evaluation of forecast JS returned null");
            anyhow::bail!("Evaluation of forecast JS returned null");
        }

        let f = &forecast_raw;
        Ok(Some(ForecastData {
            price_current: f["price_current"].as_f64().map(round2),
            price_target_average: f["price_target_average"].as_f64().map(round2),
            price_target_average_upside_pct: f["price_target_average_upside_pct"]
                .as_f64()
                .map(round2),
            price_target_max: f["price_target_max"].as_f64().map(round2),
            price_target_min: f["price_target_min"].as_f64().map(round2),
            price_target_analyst_count: f["price_target_analyst_count"].as_u64().map(|n| n as u32),
            rating_strong_buy: f["rating_strong_buy"].as_u64().map(|n| n as u32),
            rating_buy: f["rating_buy"].as_u64().map(|n| n as u32),
            rating_hold: f["rating_hold"].as_u64().map(|n| n as u32),
            rating_sell: f["rating_sell"].as_u64().map(|n| n as u32),
            rating_strong_sell: f["rating_strong_sell"].as_u64().map(|n| n as u32),
            rating_total_analysts: f["rating_total_analysts"].as_u64().map(|n| n as u32),
            rating_consensus: f["rating_consensus"].as_str().map(str::to_string),
        }))
    }

    /// Extracts price target and analyst rating data from the TradingView
    /// forecast page. Returns `serde_json::Value` (null if forecast page is
    /// unavailable).
    async fn evaluate_forecast_js(&self) -> Result<serde_json::Value> {
        // forecastPage- and sectionSubtitle- prefixes are semantic and stable.
        // All other selectors anchor on text content or the stable analystRating- prefix.
        const JS: &str = r#"(function() {
            if (!document.querySelector('[class*="forecastPage-"]')) return null;

            // ── Price target ──────────────────────────────────────────────────
            // Anchor on the stable label text "1 year price target" (leaf span),
            // go up two levels to the item container, then find the price (plain
            // decimal) and upside (contains %) leaf spans within it.
            const ptLabelEl = Array.from(document.querySelectorAll('span'))
                .find(el => !el.children.length && el.textContent.trim() === '1 year price target');
            // span → title-div → item-div
            const ptItem = ptLabelEl ? ptLabelEl.parentElement?.parentElement : null;
            const priceEl = ptItem
                ? Array.from(ptItem.querySelectorAll('span'))
                    .find(el => !el.children.length && /^\d[\d,.]*$/.test(el.textContent.trim()))
                : null;
            const changeEl = ptItem
                ? Array.from(ptItem.querySelectorAll('span'))
                    .find(el => !el.children.length && el.textContent.trim().includes('%'))
                : null;

            const avg = priceEl ? parseFloat(priceEl.textContent.trim().replace(/,/g, '')) : null;
            let upside_pct = null;
            if (changeEl) {
                const p = parseFloat(changeEl.textContent.trim().replace(/[()%+]/g, ''));
                if (!isNaN(p)) upside_pct = p;
            }
            // current = avg / (1 + upside_pct/100)
            const current = (avg != null && upside_pct != null)
                ? avg / (1 + upside_pct / 100)
                : null;

            // ── Price target max/min/count from subtitle text ─────────────────
            let pt_count = null, pt_max = null, pt_min = null;
            for (const el of document.querySelectorAll('[class*="sectionSubtitle-"]')) {
                const t = el.textContent;
                if (!t.includes('max estimate')) continue;
                const cm = t.match(/The\s+(\d+)\s+analyst/);
                const mx = t.match(/max estimate of\s+([\d,.]+)/);
                const mn = t.match(/min estimate of\s+([\d,.]+)/);
                if (cm) pt_count = parseInt(cm[1]);
                if (mx) pt_max = parseFloat(mx[1].replace(/,/g, ''));
                if (mn) pt_min = parseFloat(mn[1].replace(/,/g, ''));
                break;
            }

            // ── Analyst rating total from subtitle text ───────────────────────
            let rating_total = null;
            for (const el of document.querySelectorAll('[class*="sectionSubtitle-"]')) {
                const t = el.textContent;
                if (!t.includes('analysts giving stock ratings')) continue;
                const m = t.match(/(\d+)\s+analysts/);
                if (m) rating_total = parseInt(m[1]);
                break;
            }

            // ── Analyst rating counts ─────────────────────────────────────────
            // [class*="analystRating-"] is a stable semantic prefix. Within it,
            // the ratings wrap is the last direct child. Its children repeat as
            // triplets: label-div → bar-div → value-div.
            const ratingMap = {};
            const analystRating = document.querySelector('[class*="analystRating-"]');
            // analystRating > lastElementChild = wrap-* (has 2 children: speedometer
            // labels block and the actual rating triplets block)
            const outerWrap = analystRating ? analystRating.lastElementChild : null;
            const wrap = outerWrap ? outerWrap.lastElementChild : null;
            if (wrap) {
                const children = Array.from(wrap.children);
                for (let i = 0; i + 2 < children.length; i += 3) {
                    const title = children[i].textContent.trim();
                    const value = parseInt(children[i + 2].textContent.trim()) || 0;
                    if (title) ratingMap[title] = value;
                }
            }

            // Compute consensus via TradingView's weighted 1–5 scale.
            const _sb  = ratingMap['Strong buy']  ?? 0;
            const _b   = ratingMap['Buy']         ?? 0;
            const _h   = ratingMap['Hold']        ?? 0;
            const _s   = ratingMap['Sell']        ?? 0;
            const _ss  = ratingMap['Strong sell'] ?? 0;
            const _tot = _sb + _b + _h + _s + _ss;
            let consensus = null;
            if (_tot > 0) {
                const score = (_sb * 5 + _b * 4 + _h * 3 + _s * 2 + _ss * 1) / _tot;
                if      (score >= 4.5) consensus = 'Strong Buy';
                else if (score >= 3.5) consensus = 'Buy';
                else if (score >= 2.5) consensus = 'Neutral';
                else if (score >= 1.5) consensus = 'Sell';
                else                   consensus = 'Strong Sell';
            }

            return {
                price_current:                   current,
                price_target_average:            avg,
                price_target_average_upside_pct: upside_pct,
                price_target_max:                pt_max,
                price_target_min:                pt_min,
                price_target_analyst_count:      pt_count,
                rating_total_analysts:           rating_total,
                rating_strong_buy:  ratingMap['Strong buy']  ?? null,
                rating_buy:         ratingMap['Buy']         ?? null,
                rating_hold:        ratingMap['Hold']        ?? null,
                rating_sell:        ratingMap['Sell']        ?? null,
                rating_strong_sell: ratingMap['Strong sell'] ?? null,
                rating_consensus:   consensus,
            };
        })()"#;

        let result = self.page.evaluate(JS).await?;
        let raw = result.value().cloned();
        result.into_value().with_context(|| {
            format!("Forecast JS returned a non-deserializable value; raw CDP value: {raw:?}")
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetch_forecast_data() {
        let scraper = TradingView::new()
            .await
            .expect("Failed to initialise TradingViewScraper");

        let data = scraper
            .fetch_forecast_data("NYSE", "GE")
            .await
            .expect("Failed to fetch forecast data");

        println!("{data:#?}");
    }
}
