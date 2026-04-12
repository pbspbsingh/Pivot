use anyhow::{Context, Result};

use crate::utils::CLIENT;
use reqwest::header;
use serde::Deserialize;
use std::collections::HashMap;
use tracing::warn;

const SEARCH_URL: &str = "https://query2.finance.yahoo.com/v1/finance/search";

#[derive(Deserialize)]
struct SearchResponse {
    quotes: Vec<SearchQuote>,
}

#[derive(Deserialize)]
struct SearchQuote {
    symbol: String,
    /// Human-readable exchange name e.g. "NASDAQ", "NYSE"
    #[serde(rename = "exchDisp")]
    exch_disp: Option<String>,
}

/// Fetches exchange names for a batch of symbols by querying each concurrently.
/// Returns a map of symbol -> exchange name for symbols that were found.
pub async fn get_exchanges(symbols: &[String]) -> Result<HashMap<String, String>> {
    if symbols.is_empty() {
        return Ok(HashMap::new());
    }

    let futs: Vec<_> = symbols.iter().map(|sym| fetch_exchange(sym)).collect();
    let results = futures::future::join_all(futs).await;

    let mut map = HashMap::new();
    for (sym, res) in symbols.iter().zip(results) {
        match res {
            Ok(Some(exch)) => {
                map.insert(sym.clone(), exch);
            }
            Ok(None) => {
                tracing::debug!("No exchange found for {sym}");
            }
            Err(e) => {
                tracing::warn!("Failed to fetch exchange for {sym}: {e:#}");
            }
        }
    }

    Ok(map)
}

async fn fetch_exchange(symbol: &str) -> Result<Option<String>> {
    tracing::debug!("Fetching exchange for {symbol}");

    let body = CLIENT
        .get(SEARCH_URL)
        .query(&[
            ("q", symbol),
            ("quotesCount", "1"),
            ("newsCount", "0"),
            ("enableFuzzyQuery", "false"),
        ])
        .header(header::ACCEPT, "application/json")
        .header(header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
        .header(header::REFERER, "https://finance.yahoo.com/")
        .send()
        .await
        .with_context(|| format!("Failed to reach Yahoo Finance for {symbol}"))?
        .text()
        .await
        .with_context(|| format!("Failed to read Yahoo Finance response for {symbol}"))?;

    tracing::debug!("Yahoo Finance search response for {symbol}: {body}");

    let response = serde_json::from_str::<SearchResponse>(&body)
        .with_context(|| format!("Failed to parse Yahoo Finance response for {symbol}: {body}"))?;

    let exch = response
        .quotes
        .into_iter()
        .find(|q| q.symbol.eq_ignore_ascii_case(symbol))
        .and_then(|q| q.exch_disp)
        .map(|e| to_tradingview(&e).to_string());

    Ok(exch)
}

/// Maps a Yahoo Finance `exchDisp` string to a TradingView exchange identifier.
/// Falls back to the original value if no mapping is known.
fn to_tradingview(exch: &str) -> &str {
    // Match is case-sensitive against the known Yahoo Finance values.
    // Yahoo returns display names like "NASDAQ", "NasdaqGS", "NYSE American", etc.
    match exch {
        // United States
        "NASDAQ" | "NasdaqGS" | "NasdaqGM" | "NasdaqCM" => "NASDAQ",
        "NYSE" | "New York Stock Exchange" => "NYSE",
        "NYSE American" | "American Stock Exchange" | "NYSE MKT" => "AMEX",
        "NYSE Arca" => "NYSEARCA",
        "Cboe BZX" | "BATS" => "CBOE",
        "OTC Bulletin Board" | "Other OTC" | "Pink Sheets" | "OTC Markets" => "OTC",
        // Canada
        "Toronto" | "TSX" => "TSX",
        "TSX Venture" => "TSXV",
        "Canadian Securities Exchange" => "CSE",
        // United Kingdom
        "London" => "LSE",
        // Europe
        "XETRA" | "Frankfurt" => "XETR",
        "Euronext Paris" | "Paris" => "EURONEXT",
        "Amsterdam" | "Brussels" | "Lisbon" => "EURONEXT",
        "Milan" | "Borsa Italiana" => "MIL",
        "Madrid" => "BME",
        "Stockholm" | "Nasdaq Stockholm" => "OMX",
        "Oslo" => "OSL",
        "Copenhagen" | "Nasdaq Copenhagen" => "CPH",
        "Helsinki" | "Nasdaq Helsinki" => "HEL",
        "Zurich" | "Swiss Exchange" | "SIX Swiss Exchange" => "SIX",
        "Vienna" => "WBAG",
        "Warsaw" => "GPW",
        // Asia / Pacific
        "Tokyo" => "TSE",
        "Hong Kong" => "HKEX",
        "Shanghai" => "SSE",
        "Shenzhen" => "SZSE",
        "Korea Exchange" | "Seoul" => "KRX",
        "Australian" | "ASX" => "ASX",
        "Singapore" | "SGX" => "SGX",
        "Bombay" | "BSE India" => "BSE",
        "National Stock Exchange India" => "NSE",
        "Taiwan" | "TWSE" => "TWSE",
        "New Zealand" => "NZX",
        // Other
        "Tel Aviv" => "TASE",
        "Johannesburg" => "JSE",
        "Brazil" | "Bovespa" => "BMFBOVESPA",
        "Mexico" => "BMV",
        // Unknown — pass through as-is
        other => {
            warn!("Invalid Exchange detected {other}");
            other
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_get_exchanges() {
        let symbols = vec![
            "AAPL".to_string(),
            "TSLA".to_string(),
            "UUUU".to_string(),
        ];
        let result = get_exchanges(&symbols).await;

        match result {
            Ok(map) => {
                println!("Exchanges: {map:#?}");
                assert!(map.contains_key("AAPL"), "AAPL should be found");
                assert!(map.contains_key("TSLA"), "TSLA should be found");
                assert!(
                    !map.contains_key("INVALID_XYZ"),
                    "INVALID_XYZ should not be found"
                );
            }
            Err(e) => panic!("Request failed: {e:#}"),
        }
    }
}
