use anyhow::{Context, Result};
use chrome_driver::PageFeatures;

use crate::models::pipeline::{EarningsData, EarningsEntry, Periodicity};

use super::{TV_HOME, TradingView, round2};

impl TradingView {
    pub async fn fetch_earnings_data(&self, exchange: &str, symbol: &str) -> Result<EarningsData> {
        let fin_url = format!("{TV_HOME}/symbols/{exchange}-{symbol}/financials-earnings/");
        self.goto(&fin_url).await?;

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

    /// Extracts EPS and Revenue table data from the TradingView financials
    /// earnings tab.
    /// Returns a JSON object: `{ eps: { labels, rows }, revenue: { labels, rows } }`.
    async fn evaluate_earnings_js(&self) -> Result<serde_json::Value> {
        // Anchor on data-name="Reported|Estimate|Surprise" — a stable semantic attribute
        // TradingView sets explicitly on each row. No CSS module hashes anywhere.
        //
        // Observed DOM structure:
        //   tableContainer
        //     headerContainer (no data-name)
        //       values-*  >  container-* > wrap-* > value-*  (period labels)
        //     [data-name="Reported"]
        //       values-*  >  container-* > value-* OR lockButton-*
        //     [data-name="Estimate"]  …
        //     [data-name="Surprise"]  …
        const JS: &str = r#"(function() {
            const tableNames = ['eps', 'revenue'];
            const ROW_NAMES  = ['Reported', 'Estimate', 'Surprise'];
            const result = {};

            // Collect all data rows via the stable data-name attribute.
            const allRows = Array.from(
                document.querySelectorAll(ROW_NAMES.map(n => `[data-name="${n}"]`).join(','))
            );

            // Group rows by their immediate parent element; each table's rows
            // share one parent. Sort groups into DOM order (EPS first, Revenue second).
            const parentMap = new Map();
            for (const row of allRows) {
                const p = row.parentElement;
                if (!parentMap.has(p)) parentMap.set(p, []);
                parentMap.get(p).push(row);
            }
            const tableGroups = Array.from(parentMap.values()).sort((a, b) =>
                a[0].compareDocumentPosition(b[0]) & 4 ? -1 : 1
            );

            for (let t = 0; t < Math.min(tableGroups.length, tableNames.length); t++) {
                const group = tableGroups[t];
                const key   = tableNames[t];
                const rows  = {};

                for (const rowEl of group) {
                    const title    = rowEl.dataset.name;
                    const valuesEl = rowEl.querySelector('[class*="values-"]');
                    const cells    = [];
                    if (valuesEl) {
                        for (const cell of valuesEl.children) {
                            const val    = cell.querySelector('[class*="value-"]');
                            const locked = !!cell.querySelector('[class*="lockButton"]');
                            cells.push({ value: val ? val.textContent.trim() : null, locked });
                        }
                    }
                    rows[title] = cells;
                }

                // Column labels: find the header — a sibling of the data rows
                // that has a values-* child but no data-name attribute.
                const labels     = [];
                const rowsParent = group[0].parentElement;
                for (const child of rowsParent.children) {
                    if (child.dataset.name) continue; // skip data rows
                    const valuesEl = child.querySelector('[class*="values-"]');
                    if (valuesEl && valuesEl.children.length > 0) {
                        for (const cell of valuesEl.children) {
                            const val = cell.querySelector('[class*="value-"]');
                            labels.push(val ? val.textContent.trim() : null);
                        }
                        break;
                    }
                }

                result[key] = { labels, rows };
            }

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

#[cfg(test)]
mod tests {
    use super::*;

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
}
