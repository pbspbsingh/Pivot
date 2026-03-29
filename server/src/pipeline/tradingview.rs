use anyhow::{Context, Result};
use chrome_driver::{
    Browser, ChromeDriverConfig, Page, PageFeatures,
    chromiumoxide::cdp::browser_protocol::target::CloseTargetParams,
};

use crate::{
    config::CONFIG,
    models::pipeline::{EarningsData, EarningsEntry, ForecastData, Periodicity, StockBasicInfo},
};

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

    pub async fn fetch_earnings_data(&self, exchange: &str, symbol: &str) -> Result<EarningsData> {
        let fin_url = format!("{TV_HOME}/symbols/{exchange}-{symbol}/financials-earnings/");
        self.page
            .goto(&fin_url)
            .await
            .with_context(|| format!("Failed to navigate to {fin_url}"))?
            .wait_for_navigation()
            .await
            .with_context(|| format!("Page did not finish loading for {fin_url}"))?
            .sleep()
            .await;

        // Detect which period tabs are present (FQ = quarterly, FY = annual, FH = half-yearly).
        let available_tabs = self
            .page
            .evaluate(
                r#"Array.from(document.querySelectorAll('[id="FQ"],[id="FY"],[id="FH"]'))
                       .map(el => el.id)"#,
            )
            .await
            .context("Failed to query available period tabs")?
            .into_value::<Vec<String>>()
            .context("Period tab query did not return a string array")?;

        let has_quarterly = available_tabs.iter().any(|id| id == "FQ");
        let has_annual = available_tabs.iter().any(|id| id == "FY");
        let has_half_yearly = available_tabs.iter().any(|id| id == "FH");

        tracing::debug!(
            "{exchange}-{symbol} earnings tabs — quarterly:{has_quarterly} \
             annual:{has_annual} half_yearly:{has_half_yearly}"
        );

        let quarterly_earnings = if has_quarterly {
            self.extract_earnings(Periodicity::Quarterly, symbol)
                .await
                .context("Failed to extract quarterly earnings")?
        } else {
            vec![]
        };

        let annual_earnings = if has_annual {
            self.extract_earnings(Periodicity::Annual, symbol)
                .await
                .context("Failed to extract annual earnings")?
        } else if has_half_yearly {
            self.extract_earnings(Periodicity::HalfYearly, symbol)
                .await
                .context("Failed to extract half-yearly earnings")?
        } else {
            vec![]
        };

        Ok(EarningsData {
            quarterly_earnings,
            annual_earnings,
        })
    }

    /// Fetches price target and analyst ratings from the TradingView forecast page.
    pub async fn fetch_forecast_data(&self, exchange: &str, symbol: &str) -> Result<ForecastData> {
        // ── forecast page — price target + analyst ratings ──────────
        let forecast_url = format!("{TV_HOME}/symbols/{exchange}-{symbol}/forecast/");
        self.page
            .goto(&forecast_url)
            .await
            .with_context(|| format!("Failed to navigate to {forecast_url}"))?
            .wait_for_navigation()
            .await
            .with_context(|| format!("Page did not finish loading for {forecast_url}"))?
            .sleep()
            .await;

        let forecast_raw = self
            .evaluate_forecast_js()
            .await
            .context("Failed to evaluate forecast JS")?;

        // ── Build ForecastData from raw JSON ─────────────────────────────────
        let f = &forecast_raw;
        Ok(ForecastData {
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
        })
    }

    /// Clicks the period tab for the given periodicity, runs the earnings JS
    /// extractor, and parses the resulting JSON into `EarningsEntry` values.
    async fn extract_earnings(
        &self,
        periodicity: Periodicity,
        symbol: &str,
    ) -> Result<Vec<EarningsEntry>> {
        let tab_id = match periodicity {
            Periodicity::Quarterly => "FQ",
            Periodicity::Annual => "FY",
            Periodicity::HalfYearly => "FH",
        };

        // Click all buttons with this id (earnings page renders two independent
        // tab bars for EPS and Revenue using the same ids).
        self.page
            .evaluate(format!(
                r#"document.querySelectorAll('[id="{tab_id}"]').forEach(b => b.click())"#
            ))
            .await
            .with_context(|| format!("Failed to click {tab_id} tab for {symbol}"))?;
        self.page.sleep().await;

        let data = self
            .evaluate_earnings_js()
            .await
            .with_context(|| format!("Failed to evaluate earnings JS ({tab_id}) for {symbol}"))?;

        parse_earnings_json(&data, periodicity)
            .with_context(|| format!("Failed to parse earnings data ({tab_id}) for {symbol}"))
    }

    // ── Private JS evaluators ────────────────────────────────────────────────

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
                const mx = t.match(/max estimate of\s+([\d.]+)/);
                const mn = t.match(/min estimate of\s+([\d.]+)/);
                if (cm) pt_count = parseInt(cm[1]);
                if (mx) pt_max = parseFloat(mx[1]);
                if (mn) pt_min = parseFloat(mn[1]);
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

    /// Extracts EPS and Revenue table data from the TradingView financials
    /// earnings tab. Ported from Fundamentals/scraper/src/financial_scraper/mod.rs.
    /// Returns a JSON object: `{ eps: { labels, rows }, revenue: { labels, rows } }`.
    async fn evaluate_earnings_js(&self) -> Result<serde_json::Value> {
        // class*= patterns use fragment substrings; the full obfuscated suffixes
        // will change across TradingView deploys but the meaningful prefix fragment
        // stays stable (e.g. "table-GQWAi9kx" vs future "table-XYZ12345").
        const JS: &str = r#"(function() {
            const tables = document.querySelectorAll('[class*="table-GQWAi9kx"]');
            const result = {};
            const tableNames = ['eps', 'revenue'];

            tables.forEach((tbl, idx) => {
                const key = tableNames[idx] ?? `table${idx}`;

                const headerContainer = tbl.querySelector('[class*="container-OWKkVLyj"]');
                const valuesEl = headerContainer
                    ? headerContainer.querySelector('[class*="values-OWKkVLyj"]')
                    : null;
                const labels = [];
                if (valuesEl) {
                    for (const cell of valuesEl.children) {
                        const val = cell.querySelector('[class*="value-OxVAcLqi"]');
                        labels.push(val ? val.textContent.trim() : null);
                    }
                }

                const rows = {};
                for (const row of tbl.querySelectorAll('[class*="container-C9MdAMrq"]')) {
                    const titleEl = row.querySelector('[class*="titleText-C9MdAMrq"]');
                    if (!titleEl) continue;
                    const title = titleEl.textContent.trim();
                    const valuesDiv = row.querySelector('[class*="values-C9MdAMrq"]');
                    const cells = [];
                    if (valuesDiv) {
                        for (const cell of valuesDiv.children) {
                            const val = cell.querySelector('[class*="value-OxVAcLqi"]');
                            const locked = !!cell.querySelector('[class*="lockButton"]');
                            cells.push({ value: val ? val.textContent.trim() : null, locked });
                        }
                    }
                    rows[title] = cells;
                }

                result[key] = { labels, rows };
            });

            return result;
        })()"#;

        let result = self.page.evaluate(JS).await?;
        let raw = result.value().cloned();
        result.into_value().with_context(|| {
            format!("Earnings JS returned a non-deserializable value; raw CDP value: {raw:?}")
        })
    }
}

/// Parses the JSON from `evaluate_earnings_js` into a list of `EarningsEntry`.
/// Skips columns where all four values (eps reported/estimate + rev reported/estimate)
/// are absent — these are paywalled or fully-future entries with no data yet.
fn parse_earnings_json(
    data: &serde_json::Value,
    periodicity: Periodicity,
) -> Result<Vec<EarningsEntry>> {
    let eps_labels = data["eps"]["labels"]
        .as_array()
        .context("Earnings JSON missing eps.labels array")?;
    let eps_rows = &data["eps"]["rows"];
    let rev_rows = &data["revenue"]["rows"];

    let n = eps_labels.len();
    let mut entries = Vec::new();

    for i in 0..n {
        let label = match eps_labels[i].as_str() {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };

        let eps_reported =
            parse_tv_value(eps_rows["Reported"][i]["value"].as_str().unwrap_or("")).map(round2);
        let eps_estimate =
            parse_tv_value(eps_rows["Estimate"][i]["value"].as_str().unwrap_or("")).map(round2);
        let eps_surprise_pct =
            parse_tv_pct(eps_rows["Surprise"][i]["value"].as_str().unwrap_or("")).map(round2);

        let revenue_reported =
            parse_tv_value(rev_rows["Reported"][i]["value"].as_str().unwrap_or("")).map(round2);
        let revenue_estimate =
            parse_tv_value(rev_rows["Estimate"][i]["value"].as_str().unwrap_or("")).map(round2);
        let revenue_surprise_pct =
            parse_tv_pct(rev_rows["Surprise"][i]["value"].as_str().unwrap_or("")).map(round2);

        if eps_reported.is_none()
            && eps_estimate.is_none()
            && revenue_reported.is_none()
            && revenue_estimate.is_none()
        {
            continue;
        }

        entries.push(EarningsEntry {
            period_label: label,
            periodicity,
            eps_reported,
            eps_estimate,
            eps_surprise_pct,
            revenue_reported,
            revenue_estimate,
            revenue_surprise_pct,
        });
    }

    Ok(entries)
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Parses a TradingView numeric string, handling K/M/B/T suffixes (e.g. "1.63 B" → 1_630_000_000).
/// Strips unicode directional marks and treats U+2212 as minus.
/// Returns `None` for the em-dash sentinel (U+2014) and empty strings.
fn parse_tv_value(s: &str) -> Option<f64> {
    let clean: String = s
        .chars()
        .filter(|&c| {
            !matches!(
                c,
                '\u{202A}' | '\u{202B}' | '\u{202C}' | '\u{200E}' | '\u{200F}'
            )
        })
        .collect();
    let clean = clean.trim();
    if clean.is_empty() || clean == "\u{2014}" {
        return None;
    }
    let (neg, rest) = if clean.starts_with('\u{2212}') || clean.starts_with('-') {
        let skip = clean.chars().next()?.len_utf8();
        (true, &clean[skip..])
    } else {
        (false, clean)
    };
    let (num_str, mult) = match rest.chars().last() {
        Some('T') => (rest[..rest.len() - 'T'.len_utf8()].trim_end(), 1e12_f64),
        Some('B') => (rest[..rest.len() - 'B'.len_utf8()].trim_end(), 1e9_f64),
        Some('M') => (rest[..rest.len() - 'M'.len_utf8()].trim_end(), 1e6_f64),
        Some('K') => (rest[..rest.len() - 'K'.len_utf8()].trim_end(), 1e3_f64),
        _ => (rest, 1.0_f64),
    };
    let n: f64 = num_str.trim().parse().ok()?;
    Some(if neg { -(n * mult) } else { n * mult })
}

/// Parses a TradingView percentage string like "+20.78%" or "−15.40%" into a raw f64
/// (e.g. 20.78). Returns `None` for the em-dash sentinel and empty strings.
fn parse_tv_pct(s: &str) -> Option<f64> {
    let clean: String = s
        .chars()
        .filter(|&c| {
            !matches!(
                c,
                '\u{202A}' | '\u{202B}' | '\u{202C}' | '\u{200E}' | '\u{200F}'
            )
        })
        .collect();
    let clean = clean.trim().replace('\u{2212}', "-");
    if clean.is_empty() || clean == "\u{2014}" {
        return None;
    }
    let n: f64 = clean
        .trim_start_matches('+')
        .trim_end_matches('%')
        .parse()
        .ok()?;
    Some(n)
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
        let scraper = TradingView::new()
            .await
            .expect("Failed to initialise TradingViewScraper");

        let info = scraper
            .fetch_basic_info("NASDAQ", "TSLA")
            .await
            .expect("Failed to fetch basic info");

        println!("{info:#?}");
    }

    #[tokio::test]
    async fn test_fetch_earnings_data() {
        let scraper = TradingView::new()
            .await
            .expect("Failed to initialise TradingViewScraper");

        let data = scraper
            .fetch_earnings_data("NASDAQ", "GOOG")
            .await
            .expect("Failed to fetch earnings data");

        println!("{data:#?}");
    }

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
