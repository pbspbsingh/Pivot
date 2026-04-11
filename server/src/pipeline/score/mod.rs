mod deepseek;
mod ollama;
#[cfg(test)]
mod test;

use anyhow::{Context, Result};
use async_trait::async_trait;
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
        parse_response(&raw)
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
        parse_response(&raw)
    }

    fn base_input(&self, analysis: &StockAnalysis) -> Value {
        build_base_input(analysis)
    }
}

pub fn build_base_input(analysis: &StockAnalysis) -> Value {
    let earnings = &analysis.earnings.0;
    let document = analysis.document.0.as_ref();

    let most_recent_quarter = earnings
        .quarterly_earnings
        .iter()
        .find(|e| e.eps_reported.is_some())
        .map(|e| e.period_label.as_str())
        .unwrap_or("");

    json!({
        "quarterly_earnings":  earnings.quarterly_earnings,
        "annual_earnings":     earnings.annual_earnings,
        "earnings_release":    document.map(|d| d.earnings_release.as_str()).unwrap_or(""),
        "report_date":         document.map(|d| d.day.to_string()).unwrap_or_default(),
        "most_recent_quarter": most_recent_quarter,
    })
}

/// Injects the analysis input JSON into the prompt template's ```json block.
pub fn build_prompt(
    prompt: &str,
    analysis: &StockAnalysis,
    is_default: bool,
) -> anyhow::Result<String> {
    let mut input = build_base_input(analysis);
    if !is_default {
        input["forecast"] = serde_json::to_value(&analysis.forecast.0)?;
    }
    let input_json = serde_json::to_string_pretty(&input)?;

    let full_prompt = if let Some(open) = prompt.find("```json\n") {
        let after_open = open + "```json\n".len();
        if let Some(rel_close) = prompt[after_open..].find("\n```") {
            let close = after_open + rel_close;
            let after_close = close + "\n```".len();
            format!(
                "{}```json\n{}\n```{}",
                &prompt[..open],
                input_json,
                &prompt[after_close..]
            )
        } else {
            format!("{}\n\n```json\n{}\n```", prompt, input_json)
        }
    } else {
        format!("{}\n\n```json\n{}\n```", prompt, input_json)
    };
    Ok(full_prompt)
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

fn parse_response(raw: &str) -> Result<StockScore> {
    use crate::models::score::CriteriaEntry;

    let json = strip_think_and_parse(raw)?;

    let score = json["score"]
        .as_f64()
        .context("Missing 'score' in LLM response")?;

    let criteria_obj = json["criteria"]
        .as_object()
        .context("Missing 'criteria' in LLM response")?;

    let criteria = criteria_obj
        .iter()
        .map(|(key, val)| {
            let entry = CriteriaEntry {
                score: val["score"].as_f64().unwrap_or(0.0),
                reason: val["reason"].as_str().unwrap_or("").to_string(),
            };
            (key.clone(), entry)
        })
        .collect();

    Ok(StockScore {
        score,
        criteria,
        last_updated: chrono::Local::now().naive_local(),
    })
}
