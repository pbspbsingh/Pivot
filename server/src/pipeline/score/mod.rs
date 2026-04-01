mod deepseek;
mod ollama;
#[cfg(test)]
mod test;

use std::collections::HashMap;

use anyhow::{Context, Result};
use async_trait::async_trait;
use chrono::Utc;
use serde_json::{Value, json};

use crate::{
    config::{CONFIG, ScorerConfig},
    db::{self, analysis::StockAnalysis},
    models::{PromptKey, score::StockScore},
};

#[async_trait]
pub trait LlmDriver: Send + Sync {
    async fn execute(&self, ticker: &str, system: String, user: String) -> Result<String>;
}

pub struct Scorer {
    driver: Box<dyn LlmDriver>,
}

impl Scorer {
    pub fn from_config() -> Self {
        let driver: Box<dyn LlmDriver> =
            match CONFIG.scorer.as_ref().expect("Scorer not configured") {
                ScorerConfig::Ollama { host, model } => {
                    Box::new(ollama::Ollama::new(host.clone(), model.clone()))
                }
                ScorerConfig::DeepSeek { api_key, model } => {
                    Box::new(deepseek::DeepSeek::new(api_key.clone(), model.clone()))
                }
            };
        Scorer { driver }
    }

    // Can be used internally for testing
    #[cfg(test)]
    fn new_custom_ollama(host: impl Into<String>, model: impl Into<String>) -> Self {
        let driver = Box::new(ollama::Ollama::new(host.into(), model.into()));
        Scorer { driver }
    }

    pub async fn evaluate_score(&self, watchlist_id: i64, ticker: &str) -> Result<StockScore> {
        let analysis = db::analysis::get(ticker, watchlist_id)
            .await?
            .ok_or_else(|| {
                anyhow::anyhow!("No analysis data for {ticker} in watchlist {watchlist_id}")
            })?;

        let watchlist = db::watchlists::get(watchlist_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Watchlist {watchlist_id} not found"))?;

        if watchlist.is_default {
            self.evaluate_ep(&analysis).await
        } else {
            self.evaluate_vcp(&analysis).await
        }
    }

    async fn evaluate_ep(&self, analysis: &StockAnalysis) -> Result<StockScore> {
        let prompt = db::prompts::get(PromptKey::Ep)
            .await?
            .ok_or_else(|| anyhow::anyhow!("EP prompt not found"))?;

        let input = self.base_input(analysis);
        let raw = self
            .driver
            .execute(&analysis.symbol, prompt, input.to_string())
            .await?;
        parse_response(&raw, "ep_score")
    }

    async fn evaluate_vcp(&self, analysis: &StockAnalysis) -> Result<StockScore> {
        let prompt = db::prompts::get(PromptKey::Vcp)
            .await?
            .ok_or_else(|| anyhow::anyhow!("VCP prompt not found"))?;

        let mut input = self.base_input(analysis);
        input["forecast"] = serde_json::to_value(&analysis.forecast.0)?;
        let raw = self
            .driver
            .execute(&analysis.symbol, prompt, input.to_string())
            .await?;
        parse_response(&raw, "vcp_score")
    }

    fn base_input(&self, analysis: &StockAnalysis) -> Value {
        let earnings = &analysis.earnings.0;
        let document = &analysis.document.0;

        let most_recent_quarter = earnings
            .quarterly_earnings
            .iter()
            .find(|e| e.eps_reported.is_some())
            .map(|e| e.period_label.as_str())
            .unwrap_or("");

        json!({
            "quarterly_earnings":  earnings.quarterly_earnings,
            "annual_earnings":     earnings.annual_earnings,
            "earnings_release":    document.earnings_release,
            "report_date":         document.day.to_string(),
            "most_recent_quarter": most_recent_quarter,
        })
    }
}

/// Strips `<think>...</think>` blocks and markdown code fences, then parses JSON.
fn strip_think_and_parse(raw: &str) -> Result<Value> {
    let text = match raw.find("</think>") {
        Some(end) => raw[end + "</think>".len()..].trim(),
        None => raw.trim(),
    };
    // Strip markdown fences: ```json ... ``` or ``` ... ```
    let text = if text.starts_with("```") {
        let start = text.find('\n').map(|i| i + 1).unwrap_or(text.len());
        let end = text.rfind("```").unwrap_or(text.len());
        text[start..end].trim()
    } else {
        text
    };
    serde_json::from_str(text).context("Failed to parse LLM response as JSON")
}

/// Converts `{"A": {"score": 1.5, "reason": "..."}, ...}` → `HashMap<String, String>`
/// formatted as `"1.5 — reason text"` per entry.
fn extract_criteria(json: &Value) -> Result<HashMap<String, String>> {
    let obj = json["criteria"]
        .as_object()
        .context("Missing 'criteria' in LLM response")?;

    obj.iter()
        .map(|(key, val)| {
            let score = val["score"].as_f64().unwrap_or(0.0);
            let reason = val["reason"].as_str().unwrap_or("").to_string();
            Ok((key.clone(), format!("{score} — {reason}")))
        })
        .collect()
}

fn parse_response(raw: &str, score_field: &str) -> Result<StockScore> {
    let json = strip_think_and_parse(raw)?;

    let score = json[score_field]
        .as_f64()
        .with_context(|| format!("Missing '{score_field}' in LLM response"))?;

    let criteria = extract_criteria(&json)?;

    Ok(StockScore {
        score,
        criteria,
        last_updated: Utc::now().naive_utc(),
    })
}
