use std::collections::HashMap;

use anyhow::{Context, Result};
use chrome_driver::PageFeatures;

use crate::models::pipeline::{EarningsData, EarningsEntry, Periodicity};

use super::{TV_HOME, TradingView, round2};

// ── Private types ─────────────────────────────────────────────────────────────

struct IncomeEntry {
    eps_reported: Option<f64>,
    eps_yoy_growth: Option<f64>,
    revenue_reported: Option<f64>,
    revenue_yoy_growth: Option<f64>,
}

// ── TradingView methods ───────────────────────────────────────────────────────

impl TradingView {
    pub async fn fetch_earnings_data(&self, exchange: &str, symbol: &str) -> Result<EarningsData> {
        // 1. Income statement — reported values + YoY
        let is_url = format!("{TV_HOME}/symbols/{exchange}-{symbol}/financials-income-statement/");
        self.goto(&is_url).await?;

        let is_tabs = self.available_tabs().await?;
        let has_is_quarterly = is_tabs.iter().any(|id| id == "FQ");
        let has_is_annual = is_tabs.iter().any(|id| id == "FY");

        let quarterly_is = if has_is_quarterly {
            self.extract_income_statement(Periodicity::Quarterly, symbol)
                .await?
        } else {
            HashMap::new()
        };
        let annual_is = if has_is_annual {
            self.extract_income_statement(Periodicity::Annual, symbol)
                .await?
        } else {
            HashMap::new()
        };

        // 2. Earnings page — estimates + surprises (reported kept as fallback)
        let earn_url = format!("{TV_HOME}/symbols/{exchange}-{symbol}/financials-earnings/");
        self.goto(&earn_url).await?;

        let earn_tabs = self.available_tabs().await?;
        let has_quarterly = earn_tabs.iter().any(|id| id == "FQ");
        let has_annual = earn_tabs.iter().any(|id| id == "FY");
        let has_half_yearly = earn_tabs.iter().any(|id| id == "FH");

        tracing::debug!(
            "{exchange}-{symbol} earnings tabs — quarterly:{has_quarterly} \
             annual:{has_annual} half_yearly:{has_half_yearly}"
        );

        let quarterly_earn = if has_quarterly {
            self.extract_earnings(Periodicity::Quarterly, symbol)
                .await
                .context("Failed to extract quarterly earnings")?
        } else {
            vec![]
        };
        let annual_earn = if has_annual {
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

        // 3. Merge
        Ok(EarningsData {
            quarterly_earnings: merge_earnings(
                quarterly_is,
                quarterly_earn,
                Periodicity::Quarterly,
            ),
            annual_earnings: merge_earnings(annual_is, annual_earn, Periodicity::Annual),
        })
    }

    async fn available_tabs(&self) -> Result<Vec<String>> {
        self.page
            .evaluate(
                r#"Array.from(document.querySelectorAll('[id="FQ"],[id="FY"],[id="FH"]'))
                       .map(el => el.id)"#,
            )
            .await
            .context("Failed to query available period tabs")?
            .into_value::<Vec<String>>()
            .context("Period tab query did not return a string array")
    }

    async fn extract_income_statement(
        &self,
        periodicity: Periodicity,
        symbol: &str,
    ) -> Result<HashMap<String, IncomeEntry>> {
        let tab_id = match periodicity {
            Periodicity::Quarterly => "FQ",
            Periodicity::Annual => "FY",
            Periodicity::HalfYearly => "FH",
        };

        self.page
            .evaluate(format!(
                r#"document.querySelectorAll('[id="{tab_id}"]').forEach(b => b.click())"#
            ))
            .await
            .with_context(|| {
                format!("Failed to click {tab_id} tab on income statement for {symbol}")
            })?;
        self.page.sleep().await;

        let data = self.evaluate_income_statement_js().await.with_context(|| {
            format!("Failed to evaluate income statement JS ({tab_id}) for {symbol}")
        })?;

        parse_income_statement_json(&data).with_context(|| {
            format!("Failed to parse income statement data ({tab_id}) for {symbol}")
        })
    }

    async fn evaluate_income_statement_js(&self) -> Result<serde_json::Value> {
        const JS: &str = r#"(function() {
            // Period labels from the sticky header row
            const sticky = document.querySelector('[class*="stickyContainer-"]');
            const stickyRow = sticky?.children[0];
            const stickyValues = stickyRow?.querySelector('[class*="values-"]');
            const labelCells = Array.from(stickyValues?.children ?? []);
            const labels = labelCells.map(cell => {
                const v = cell.querySelector('[class*="value-"]');
                return v ? v.textContent.trim() : null;
            });

            function extractRow(dataName) {
                const row = document.querySelector(`[data-name="${dataName}"]`);
                const valuesEl = row?.querySelector('[class*="values-"]');
                return Array.from(valuesEl?.children ?? []).map(cell => {
                    const locked = !!cell.querySelector('[class*="lockButton"]');
                    if (locked) return { locked: true, value: null, change: null };
                    const valueEl = cell.querySelector('[class*="value-"]');
                    const changeEl = cell.querySelector('[class*="change-"]');
                    return {
                        locked: false,
                        value: valueEl ? valueEl.textContent.trim() : null,
                        change: changeEl ? changeEl.textContent.trim() : null
                    };
                });
            }

            return {
                labels,
                eps: extractRow('Basic earnings per share (basic EPS)'),
                revenue: extractRow('Total revenue')
            };
        })()"#;

        let result = self.page.evaluate(JS).await?;
        let raw = result.value().cloned();
        result.into_value().with_context(|| {
            format!("Income statement JS returned non-deserializable value; raw: {raw:?}")
        })
    }

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

    async fn evaluate_earnings_js(&self) -> Result<serde_json::Value> {
        const JS: &str = r#"(function() {
            const tableNames = ['eps', 'revenue'];
            const ROW_NAMES  = ['Reported', 'Estimate', 'Surprise'];
            const result = {};

            const allRows = Array.from(
                document.querySelectorAll(ROW_NAMES.map(n => `[data-name="${n}"]`).join(','))
            );

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

                const labels     = [];
                const rowsParent = group[0].parentElement;
                for (const child of rowsParent.children) {
                    if (child.dataset.name) continue;
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

// ── Income statement parser ───────────────────────────────────────────────────

fn parse_income_statement_json(data: &serde_json::Value) -> Result<HashMap<String, IncomeEntry>> {
    let labels = data["labels"]
        .as_array()
        .context("Income statement JSON missing labels array")?;
    let eps_cells = data["eps"].as_array().context("Missing eps array")?;
    let rev_cells = data["revenue"]
        .as_array()
        .context("Missing revenue array")?;

    let n = labels.len();
    let mut map = HashMap::new();

    for i in 0..n {
        let label = match labels[i].as_str() {
            Some(s) if !s.is_empty() && s != "TTM" => s.to_string(),
            _ => continue,
        };

        let locked_eps = eps_cells
            .get(i)
            .and_then(|c| c["locked"].as_bool())
            .unwrap_or(true);
        let locked_rev = rev_cells
            .get(i)
            .and_then(|c| c["locked"].as_bool())
            .unwrap_or(true);

        // Skip if both are locked — no useful data for this period
        if locked_eps && locked_rev {
            continue;
        }

        let eps_reported = if locked_eps {
            None
        } else {
            parse_tv_value(eps_cells[i]["value"].as_str().unwrap_or("")).map(round2)
        };
        let eps_yoy_growth = if locked_eps {
            None
        } else {
            parse_tv_pct(eps_cells[i]["change"].as_str().unwrap_or("")).map(round2)
        };
        let revenue_reported = if locked_rev {
            None
        } else {
            parse_tv_value(rev_cells[i]["value"].as_str().unwrap_or("")).map(round2)
        };
        let revenue_yoy_growth = if locked_rev {
            None
        } else {
            parse_tv_pct(rev_cells[i]["change"].as_str().unwrap_or("")).map(round2)
        };

        map.insert(
            label,
            IncomeEntry {
                eps_reported,
                eps_yoy_growth,
                revenue_reported,
                revenue_yoy_growth,
            },
        );
    }

    Ok(map)
}

// ── Earnings page parser ──────────────────────────────────────────────────────

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
            eps_yoy_growth: None, // filled in during merge
            revenue_reported,
            revenue_estimate,
            revenue_surprise_pct,
            revenue_yoy_growth: None, // filled in during merge
        });
    }

    Ok(entries)
}

// ── Merge ─────────────────────────────────────────────────────────────────────

fn merge_earnings(
    income_stmt: HashMap<String, IncomeEntry>,
    earnings: Vec<EarningsEntry>,
    periodicity: Periodicity,
) -> Vec<EarningsEntry> {
    let mut earn_map: HashMap<String, EarningsEntry> = earnings
        .into_iter()
        .map(|e| (e.period_label.clone(), e))
        .collect();

    // Collect all period labels from both sources, deduplicated
    let mut all_labels: Vec<String> = income_stmt.keys().cloned().collect();
    for label in earn_map.keys() {
        if !income_stmt.contains_key(label) {
            all_labels.push(label.clone());
        }
    }

    all_labels.sort_by_key(|l| parse_period_sort_key(l));

    all_labels
        .into_iter()
        .filter_map(|label| {
            let is_entry = income_stmt.get(&label);
            let earn_entry = earn_map.remove(&label);

            let eps_reported = is_entry
                .and_then(|e| e.eps_reported)
                .or_else(|| earn_entry.as_ref().and_then(|e| e.eps_reported));
            let revenue_reported = is_entry
                .and_then(|e| e.revenue_reported)
                .or_else(|| earn_entry.as_ref().and_then(|e| e.revenue_reported));

            // Skip if truly empty
            if eps_reported.is_none()
                && revenue_reported.is_none()
                && earn_entry
                    .as_ref()
                    .is_none_or(|e| e.eps_estimate.is_none() && e.revenue_estimate.is_none())
            {
                return None;
            }

            Some(EarningsEntry {
                period_label: label,
                periodicity,
                eps_reported,
                eps_estimate: earn_entry.as_ref().and_then(|e| e.eps_estimate),
                eps_surprise_pct: earn_entry.as_ref().and_then(|e| e.eps_surprise_pct),
                eps_yoy_growth: is_entry.and_then(|e| e.eps_yoy_growth),
                revenue_reported,
                revenue_estimate: earn_entry.as_ref().and_then(|e| e.revenue_estimate),
                revenue_surprise_pct: earn_entry.as_ref().and_then(|e| e.revenue_surprise_pct),
                revenue_yoy_growth: is_entry.and_then(|e| e.revenue_yoy_growth),
            })
        })
        .collect()
}

/// Parses period labels into a (year, quarter) sort key for chronological ordering.
///
/// Handles:
/// - Bare year labels: `"2022"` → `(2022, 0)`
/// - Quarterly:        `"Q1 '24"` → `(2024, 1)`
/// - Annual/other:     `"FY '23"` → `(2023, 0)`
fn parse_period_sort_key(label: &str) -> (i32, i32) {
    // Bare year label (annual from income statement): "2022", "2023", etc.
    if let Ok(year) = label.parse::<i32>() {
        return (year, 0);
    }

    // Labeled period: "Q1 '24", "FY '23", "H1 '24", etc.
    let parts: Vec<&str> = label.splitn(2, ' ').collect();
    if parts.len() != 2 {
        return (9999, 0);
    }
    let year_str = parts[1].trim_start_matches('\'');
    let year: i32 = year_str
        .parse()
        .map(|y: i32| if y < 100 { 2000 + y } else { y })
        .unwrap_or(9999);
    let quarter = match parts[0] {
        "Q1" => 1,
        "Q2" => 2,
        "Q3" => 3,
        "Q4" => 4,
        _ => 0,
    };
    (year, quarter)
}

// ── Value parsers ─────────────────────────────────────────────────────────────

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

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetch_earnings_data() {
        let scraper = TradingView::new()
            .await
            .expect("Failed to initialise TradingViewScraper");

        let data = scraper
            .fetch_earnings_data("NASDAQ", "BNAI")
            .await
            .expect("Failed to fetch earnings data");

        println!("{data:#?}");
    }
}
