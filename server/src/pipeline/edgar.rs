use std::time::Duration;

use anyhow::{Context, Result};
use chrono::NaiveDate;
use serde::Deserialize;

use crate::{db, models::pipeline::EightK};

const SEC_USER_AGENT: &str = "Pivot pbspbsingh@gmail.com";
const RATE_LIMIT: Duration = Duration::from_millis(110);

const TICKERS_URL: &str = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_URL: &str = "https://data.sec.gov/submissions";
const ARCHIVES_URL: &str = "https://www.sec.gov/Archives/edgar/data";

pub struct Edgar {
    http: reqwest::Client,
}

impl Edgar {
    pub fn new() -> Result<Self> {
        let http = reqwest::Client::builder()
            .user_agent(SEC_USER_AGENT)
            .build()
            .context("Failed to build HTTP client")?;
        Ok(Self { http })
    }

    /// Returns the 10-digit zero-padded CIK for `symbol`, using the DB as a
    /// cache. On a miss, downloads the SEC tickers JSON and persists the result.
    pub async fn resolve_cik(&self, symbol: &str) -> Result<String> {
        let symbol = symbol.to_uppercase();

        if let Some(cik) = db::edgar::get_cik(&symbol).await? {
            return Ok(cik);
        }

        // Fetch from SEC.
        tokio::time::sleep(RATE_LIMIT).await;
        let map: serde_json::Value = self
            .http
            .get(TICKERS_URL)
            .send()
            .await
            .context("Failed to fetch company_tickers.json")?
            .json()
            .await
            .context("Failed to parse company_tickers.json")?;

        // The JSON is an object keyed by ordinal: { "0": { cik_str, ticker, title }, ... }
        let cik = map
            .as_object()
            .context("company_tickers.json is not an object")?
            .values()
            .find(|entry| {
                entry["ticker"]
                    .as_str()
                    .is_some_and(|t| t.eq_ignore_ascii_case(&symbol))
            })
            .and_then(|entry| entry["cik_str"].as_u64())
            .with_context(|| format!("Ticker {symbol} not found in SEC tickers list"))?;

        let cik = format!("{cik:010}");
        db::edgar::set_cik(&symbol, &cik).await?;
        Ok(cik)
    }

    /// Fetches the most recent 8-K filing for `symbol`, including Exhibit 99.1
    /// and 99.2 converted to Markdown.
    pub async fn fetch_latest_8k(&self, symbol: &str) -> Result<EightK> {
        let cik = self
            .resolve_cik(symbol)
            .await
            .with_context(|| format!("Failed to resolve CIK for {symbol}"))?;

        // Fetch submissions metadata.
        tokio::time::sleep(RATE_LIMIT).await;
        let subs: Submissions = self
            .http
            .get(format!("{SUBMISSIONS_URL}/CIK{cik}.json"))
            .send()
            .await
            .with_context(|| format!("Failed to fetch submissions for {symbol}"))?
            .json()
            .await
            .with_context(|| format!("Failed to parse submissions JSON for {symbol}"))?;

        // Find the most recent 8-K.
        let filings = &subs.filings.recent;
        let idx = filings
            .form
            .iter()
            .position(|f| f == "8-K")
            .with_context(|| format!("No 8-K filings found for {symbol}"))?;

        let accession = filings.accession_number[idx].replace('-', "");
        let filed_at = NaiveDate::parse_from_str(&filings.filing_date[idx], "%Y-%m-%d")
            .with_context(|| format!("Invalid filing date: {}", filings.filing_date[idx]))?;
        let raw_cik = cik.trim_start_matches('0');

        // Fetch the filing index to find document filenames.
        tokio::time::sleep(RATE_LIMIT).await;
        let index_url = format!("{ARCHIVES_URL}/{raw_cik}/{accession}/{accession}-index.htm");
        let index_html = self
            .http
            .get(&index_url)
            .send()
            .await
            .with_context(|| format!("Failed to fetch filing index: {index_url}"))?
            .error_for_status()
            .with_context(|| format!("Filing index returned error status: {index_url}"))?
            .text()
            .await
            .context("Failed to read filing index HTML")?;

        let description = extract_description(&index_html);
        let (ex99_1, ex99_2) = extract_exhibit_filenames(&index_html);
        let is_earnings_release = ex99_1.is_some() || ex99_2.is_some();

        let press_release = match ex99_1 {
            Some(filename) => {
                let url = format!("{ARCHIVES_URL}/{raw_cik}/{accession}/{filename}");
                Some(self.fetch_as_markdown(&url).await?)
            }
            None => None,
        };

        let cfo_commentary = match ex99_2 {
            Some(filename) => {
                let url = format!("{ARCHIVES_URL}/{raw_cik}/{accession}/{filename}");
                Some(self.fetch_as_markdown(&url).await?)
            }
            None => None,
        };

        Ok(EightK {
            filed_at,
            description,
            is_earnings_release,
            press_release,
            cfo_commentary,
        })
    }

    async fn fetch_as_markdown(&self, url: &str) -> Result<String> {
        tokio::time::sleep(RATE_LIMIT).await;
        let html = self
            .http
            .get(url)
            .send()
            .await
            .with_context(|| format!("Failed to fetch {url}"))?
            .error_for_status()
            .with_context(|| format!("Request returned error status: {url}"))?
            .text()
            .await
            .with_context(|| format!("Failed to read response from {url}"))?;

        htmd::convert(&html).with_context(|| format!("Failed to convert HTML to markdown: {url}"))
    }
}

// ── SEC JSON deserialization ──────────────────────────────────────────────────

#[derive(Deserialize)]
struct Submissions {
    filings: FilingsWrapper,
}

#[derive(Deserialize)]
struct FilingsWrapper {
    recent: RecentFilings,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecentFilings {
    accession_number: Vec<String>,
    filing_date: Vec<String>,
    form: Vec<String>,
}

// ── HTML parsing helpers ──────────────────────────────────────────────────────

/// Extracts the primary document description from the filing index HTML.
/// Falls back to "8-K" if not found.
///
/// The filing index table has columns: Seq | Description | Document | Type | Size.
/// We find the row whose Type cell (index 3) is exactly "8-K" and return its
/// Description cell (index 1), which is typically "CURRENT REPORT".
fn extract_description(html: &str) -> String {
    for row in split_table_rows(html) {
        let cells = extract_td_texts(row);
        if cells.get(3).map(|t| t.trim()) == Some("8-K")
            && let Some(desc) = cells.get(1)
        {
            let desc = desc.trim();
            if !desc.is_empty() {
                return desc.to_string();
            }
        }
    }
    "8-K".to_string()
}

/// Scans the filing index HTML for Exhibit 99.1 and 99.2 filenames.
/// Returns (ex99_1_filename, ex99_2_filename).
///
/// Operates on whole `<tr>` blocks rather than individual lines so that
/// exhibit type and href can span multiple lines in the HTML.
fn extract_exhibit_filenames(html: &str) -> (Option<String>, Option<String>) {
    let mut ex99_1 = None;
    let mut ex99_2 = None;

    for row in split_table_rows(html) {
        let cells = extract_td_texts(row);
        // Prefer the Type column (index 3) for a precise match; fall back to
        // searching the entire row string for malformed/non-standard indexes.
        let type_text = cells
            .get(3)
            .map(|s| s.to_lowercase())
            .unwrap_or_else(|| row.to_lowercase());

        if ex99_1.is_none() && type_text.contains("ex-99.1") {
            ex99_1 = extract_href(row);
        } else if ex99_2.is_none() && type_text.contains("ex-99.2") {
            ex99_2 = extract_href(row);
        }
    }

    (ex99_1, ex99_2)
}

/// Splits `html` into `<tr>…</tr>` chunks (case-insensitive).
fn split_table_rows(html: &str) -> Vec<&str> {
    let mut rows = Vec::new();
    let lower = html.to_lowercase();
    let mut pos = 0;

    while let Some(rel_start) = lower[pos..].find("<tr") {
        let abs_start = pos + rel_start;
        match lower[abs_start..].find("</tr>") {
            Some(rel_end) => {
                let abs_end = abs_start + rel_end + 5; // +5 for "</tr>"
                rows.push(&html[abs_start..abs_end]);
                pos = abs_end;
            }
            None => break,
        }
    }
    rows
}

/// Extracts the stripped-text content of each `<td>` in `row`.
fn extract_td_texts(row: &str) -> Vec<String> {
    let mut cells = Vec::new();
    let lower = row.to_lowercase();
    let mut pos = 0;

    while let Some(rel_start) = lower[pos..].find("<td") {
        let abs_start = pos + rel_start;
        let Some(rel_tag_end) = lower[abs_start..].find('>') else {
            break;
        };
        let content_start = abs_start + rel_tag_end + 1;
        let Some(rel_close) = lower[content_start..].find("</td>") else {
            break;
        };
        let content = &row[content_start..content_start + rel_close];
        cells.push(strip_tags(content).unwrap_or_default());
        pos = content_start + rel_close + 5;
    }
    cells
}

fn extract_href(s: &str) -> Option<String> {
    let start = s.to_lowercase().find("href=\"")? + 6;
    let rest = &s[start..];
    let end = rest.find('"')?;
    let href = rest[..end].trim().to_string();
    if href.is_empty() { None } else { Some(href) }
}

fn strip_tags(s: &str) -> Option<String> {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let result = out.trim().to_string();
    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetch_latest_8k() {
        db::init().await.expect("Failed to init database");
        let edgar = Edgar::new().expect("Failed to create Edgar client");

        let filing = edgar
            .fetch_latest_8k("GOOG")
            .await
            .expect("Failed to fetch 8-K");

        println!("{filing:#?}");
    }
}
