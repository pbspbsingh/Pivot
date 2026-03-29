#[derive(Debug)]
pub struct StockBasicInfo {
    pub sector: String,
    pub industry: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub enum Periodicity {
    Annual,
    Quarterly,
    HalfYearly,
}

#[derive(Debug)]
pub struct EarningsEntry {
    pub period_label: String,
    pub periodicity: Periodicity,
    pub eps_reported: Option<f64>,
    pub eps_estimate: Option<f64>,
    /// Fractional surprise, e.g. 0.05 = 5%
    pub eps_surprise: Option<f64>,
    pub revenue_reported: Option<f64>,
    pub revenue_estimate: Option<f64>,
    /// Fractional surprise, e.g. -0.02 = -2%
    pub revenue_surprise: Option<f64>,
}

#[derive(Debug)]
pub struct ForecastData {
    // Price target
    pub price_current: Option<f64>,
    pub price_target_average: Option<f64>,
    pub price_target_average_upside_pct: Option<f64>,
    pub price_target_max: Option<f64>,
    pub price_target_min: Option<f64>,
    pub price_target_analyst_count: Option<u32>,

    // Analyst rating
    pub rating_strong_buy: Option<u32>,
    pub rating_buy: Option<u32>,
    pub rating_hold: Option<u32>,
    pub rating_sell: Option<u32>,
    pub rating_strong_sell: Option<u32>,
    pub rating_total_analysts: Option<u32>,
    pub rating_consensus: Option<String>,

    // EPS + Revenue by period type
    pub quarterly_earnings: Vec<EarningsEntry>,
    pub annual_earnings: Vec<EarningsEntry>,
}
