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
        let pool = db::pool();

        // Check cache first.
        let cached = sqlx::query_scalar!("SELECT cik FROM cik_cache WHERE symbol = ?", symbol)
            .fetch_optional(pool)
            .await
            .context("Failed to query cik_cache")?;

        if let Some(cik) = cached {
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

        sqlx::query!(
            "INSERT OR REPLACE INTO cik_cache (symbol, cik) VALUES (?, ?)",
            symbol,
            cik
        )
        .execute(pool)
        .await
        .context("Failed to insert into cik_cache")?;

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
fn extract_description(html: &str) -> String {
    // The description appears as the first cell in the documents table after
    // the header. We look for "8-K" or "CURRENT REPORT" in the text.
    for line in html.lines() {
        let line = line.trim();
        if line.contains("CURRENT REPORT") || line.contains("8-K") {
            if let Some(text) = strip_tags(line) {
                let text = text.trim().to_string();
                if !text.is_empty() {
                    return text;
                }
            }
        }
    }
    "8-K".to_string()
}

/// Scans the filing index HTML for Exhibit 99.1 and 99.2 filenames.
/// Returns (ex99_1_filename, ex99_2_filename).
fn extract_exhibit_filenames(html: &str) -> (Option<String>, Option<String>) {
    let mut ex99_1 = None;
    let mut ex99_2 = None;

    // Each exhibit row looks like:
    //   <td>EX-99.1</td> ... <td><a href="filename.htm">filename.htm</a></td>
    // We scan for the exhibit type then grab the nearest href on the same line.
    for line in html.lines() {
        let line_lower = line.to_lowercase();
        if line_lower.contains("ex-99.1") || line_lower.contains("exhibit 99.1") {
            if let Some(href) = extract_href(line) {
                ex99_1 = Some(href);
            }
        } else if line_lower.contains("ex-99.2") || line_lower.contains("exhibit 99.2") {
            if let Some(href) = extract_href(line) {
                ex99_2 = Some(href);
            }
        }
    }

    (ex99_1, ex99_2)
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
        db::init("database.sqlite")
            .await
            .expect("Failed to init database");
        let edgar = Edgar::new().expect("Failed to create Edgar client");

        let filing = edgar
            .fetch_latest_8k("GOOG")
            .await
            .expect("Failed to fetch 8-K");

        println!("{filing:#?}");
    }
}
