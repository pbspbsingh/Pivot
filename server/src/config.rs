use anyhow::{Context, Result};
use serde::Deserialize;
use std::{fs, sync::LazyLock};

pub static CONFIG: LazyLock<Config> =
    LazyLock::new(|| Config::load("config.toml").expect("Failed to load config.toml"));

#[derive(Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub chrome: ChromeConfig,
    pub scorer: Option<ScorerConfig>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ScorerConfig {
    Ollama { host: String, model: String },
    DeepSeek { api_key: String, model: String },
}

#[derive(Deserialize)]
pub struct ChromeConfig {
    pub binary: String,
    pub user_data_dir: Option<String>,
    pub launch_if_needed: bool,
}

#[derive(Deserialize)]
pub struct ServerConfig {
    pub port: u16,
    pub log_level: String,
}

#[derive(Deserialize)]
pub struct DatabaseConfig {
    pub path: String,
}

impl Config {
    fn load(path: &str) -> Result<Self> {
        let contents = fs::read_to_string(path)
            .with_context(|| format!("Failed to read config file: {path}"))?;
        toml::from_str(&contents).with_context(|| format!("Failed to parse config file: {path}"))
    }
}
