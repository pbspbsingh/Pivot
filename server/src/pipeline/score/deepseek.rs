use anyhow::{Context, Result};
use async_trait::async_trait;
use futures::StreamExt;
use serde::Deserialize;
use tokio::time::{Duration, Instant, interval};
use tracing::info;

use crate::pipeline::score::LlmDriver;
use crate::utils;

const API_URL: &str = "https://api.deepseek.com/chat/completions";

pub struct DeepSeek {
    api_key: String,
    model: String,
    client: &'static reqwest::Client,
}

#[derive(Deserialize)]
struct StreamChunk {
    choices: Vec<Choice>,
    usage: Option<Usage>,
}

#[derive(Deserialize)]
struct Choice {
    delta: Delta,
}

#[derive(Deserialize)]
struct Delta {
    // reasoning_content contains <think> tokens — ignored, we only want content
    #[serde(default)]
    content: Option<String>,
}

#[derive(Deserialize)]
struct Usage {
    prompt_tokens: u64,
    completion_tokens: u64,
}

impl DeepSeek {
    pub fn new(api_key: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            model: model.into(),
            client: &utils::CLIENT,
        }
    }
}

#[async_trait]
impl LlmDriver for DeepSeek {
    async fn execute(&self, ticker: &str, system: String, user: String) -> Result<String> {
        let body = serde_json::json!({
            "model": self.model,
            "stream": true,
            "stream_options": { "include_usage": true },
            "messages": [
                { "role": "system", "content": system },
                { "role": "user",   "content": user   },
            ],
        });

        let resp = self
            .client
            .post(API_URL)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await
            .context("DeepSeek request failed")?
            .error_for_status()
            .context("DeepSeek returned error status")?;

        let start = Instant::now();
        let mut ticker_interval = interval(Duration::from_secs(30));
        ticker_interval.tick().await;

        let mut stream = resp.bytes_stream();
        let mut line_buf = String::new();
        let mut content = String::new();
        let mut chunks: u64 = 0;
        let mut prompt_tokens: u64 = 0;
        let mut completion_tokens: u64 = 0;

        loop {
            tokio::select! {
                chunk = stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            line_buf.push_str(
                                std::str::from_utf8(&bytes).context("Invalid UTF-8 in stream")?,
                            );

                            while let Some(pos) = line_buf.find('\n') {
                                let line = line_buf[..pos].trim().to_string();
                                line_buf = line_buf[pos + 1..].to_string();

                                if line.is_empty() {
                                    continue;
                                }

                                if line == "data: [DONE]" {
                                    let elapsed = start.elapsed().as_secs_f64();
                                    let tps = if elapsed > 0.0 {
                                        completion_tokens as f64 / elapsed
                                    } else {
                                        0.0
                                    };
                                    info!(
                                        ticker,
                                        model = %self.model,
                                        elapsed_s = format!("{elapsed:.1}"),
                                        prompt_tokens,
                                        completion_tokens,
                                        tok_per_sec = format!("{tps:.1}"),
                                        "deepseek done"
                                    );
                                    return Ok(content);
                                }

                                let data = line.strip_prefix("data: ").unwrap_or(&line);
                                let chunk: StreamChunk = serde_json::from_str(data)
                                    .context("Failed to parse stream chunk")?;

                                if let Some(usage) = chunk.usage {
                                    prompt_tokens = usage.prompt_tokens;
                                    completion_tokens = usage.completion_tokens;
                                }

                                for choice in &chunk.choices {
                                    if let Some(text) = &choice.delta.content
                                        && !text.is_empty()
                                    {
                                        content.push_str(text);
                                        chunks += 1;
                                    }
                                }
                            }
                        }
                        Some(Err(e)) => return Err(e).context("Stream read error"),
                        None => break,
                    }
                }
                _ = ticker_interval.tick() => {
                    info!(
                        ticker,
                        model = %self.model,
                        elapsed_s = format!("{:.0}", start.elapsed().as_secs_f64()),
                        chunks,
                        "deepseek generating"
                    );
                }
            }
        }

        Ok(content)
    }
}
