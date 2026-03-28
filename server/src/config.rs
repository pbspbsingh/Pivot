use anyhow::{Context, Result};
use serde::Deserialize;
use std::{fs, sync::LazyLock};

pub static CONFIG: LazyLock<Config> =
    LazyLock::new(|| Config::load("config.toml").expect("Failed to load config.toml"));

#[derive(Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
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
