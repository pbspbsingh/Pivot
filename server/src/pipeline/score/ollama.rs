use anyhow::{Context, Result};
use async_trait::async_trait;
use futures::StreamExt;
use serde::Deserialize;
use tokio::time::{Duration, Instant, interval};

use crate::pipeline::score::LlmDriver;

pub struct Ollama {
    host: String,
    model: String,
    client: reqwest::Client,
}

#[derive(Deserialize)]
struct StreamChunk {
    message: ChatMessage,
    done: bool,
    // present only in the final chunk
    eval_count: Option<u64>,
    eval_duration: Option<u64>, // nanoseconds
    prompt_eval_count: Option<u64>,
}

#[derive(Deserialize)]
struct ChatMessage {
    content: String,
}

impl Ollama {
    pub fn new(host: String, model: String) -> Self {
        Ollama {
            host,
            model,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl LlmDriver for Ollama {
    async fn execute(&self, system: String, user: String) -> Result<String> {
        let url = format!("{}/api/chat", self.host);

        let body = serde_json::json!({
            "model": self.model,
            "stream": true,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user",   "content": user   },
            ],
        });

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .context("Ollama request failed")?
            .error_for_status()
            .context("Ollama returned error status")?;

        let start = Instant::now();
        let mut ticker = interval(Duration::from_secs(30));
        ticker.tick().await; // discard the immediate first tick

        let mut stream = resp.bytes_stream();
        let mut line_buf = String::new();
        let mut content = String::new();
        let mut tokens: u64 = 0;

        loop {
            tokio::select! {
                chunk = stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            line_buf.push_str(std::str::from_utf8(&bytes).context("Invalid UTF-8 in stream")?);

                            while let Some(pos) = line_buf.find('\n') {
                                let line = line_buf[..pos].trim().to_string();
                                line_buf = line_buf[pos + 1..].to_string();

                                if line.is_empty() {
                                    continue;
                                }

                                let chunk: StreamChunk = serde_json::from_str(&line)
                                    .context("Failed to parse stream chunk")?;

                                content.push_str(&chunk.message.content);
                                tokens += 1;

                                if chunk.done {
                                    let elapsed = start.elapsed().as_secs_f64();
                                    let eval_tokens = chunk.eval_count.unwrap_or(tokens);
                                    let tps = chunk.eval_duration
                                        .filter(|&d| d > 0)
                                        .map(|d| eval_tokens as f64 / (d as f64 / 1e9))
                                        .unwrap_or(0.0);
                                    eprintln!(
                                        "[ollama] done — {elapsed:.1}s | prompt {} tok | generated {} tok | {tps:.1} tok/s",
                                        chunk.prompt_eval_count.unwrap_or(0),
                                        eval_tokens,
                                    );
                                    return Ok(content);
                                }
                            }
                        }
                        Some(Err(e)) => return Err(e).context("Stream read error"),
                        None => break,
                    }
                }
                _ = ticker.tick() => {
                    eprintln!(
                        "[ollama] {:.0}s elapsed | ~{tokens} tokens generated so far",
                        start.elapsed().as_secs_f64(),
                    );
                }
            }
        }

        Ok(content)
    }
}
