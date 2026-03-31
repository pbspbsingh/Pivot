use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockScore {
    pub score: f64,
    pub criteria: HashMap<String, String>,
    pub last_updated: NaiveDateTime,
}
