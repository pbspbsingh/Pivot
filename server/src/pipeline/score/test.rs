use std::time::{Duration, Instant};

use anyhow::Result;
use serde::Deserialize;

// ── EP benchmark ─────────────────────────────────────────────────────────────

const EP_CRITERIA_KEYS: &[&str] = &["A", "B", "C", "D", "E", "F", "G", "H", "I"];
const EP_WATCHLIST_ID: i64 = 1;

// Claude's reference scoring for EP stocks against the EP prompt.
//
// PLTR (Q4 '25): A=1 (8.6% surprise ≥5%), B=1 (4.9% rev ≥3%), C=0 (initial FY26 guidance, no prior),
//   D=2 ((1.29-0.75)/0.75=72% ≥50%), E=1.5 (3/3 valid YoY positive, Q4'23 unavailable),
//   F=0 (Q4'24 margin not explicitly stated), G=-2 (MACRO+GEOPOLITICAL), H=0, I=0 → 3.5
//
// NVDA (Q4 '25 / FY26): A=1 (5.54% ≥5%), B=1 (3.03% ≥3%), C=0 (initial Q1FY27 guidance, no prior),
//   D=2 ((8.28-4.77)/4.77=73.6% ≥50%), E=1.5 (3/3 valid YoY positive, Q4'23 unavailable),
//   F=0 (Q4 FY25 margin not stated), G=-2 (MACRO+GEOPOLITICAL+REGULATORY+COMPETITIVE ≥2), H=0, I=0 → 3.5
//
// HOOD (Q4 '25): A=0.5 (4.61% ≥2%), B=0 (rev -5.29% negative), C=0 (opex guidance only, no rev/EPS),
//   D=0.5 ((2.33-2.05)/2.05=13.7% ≥5%), E=1.5 (3/3 valid YoY positive, Q4'23 unavailable),
//   F=0 (no operating margin stated for Q4), G=-2 (REGULATORY+COMPETITIVE), H=0, I=0 → 0.5 → clamped 1.0
const EP_REFERENCES: &[(&str, &[(&str, f64)], f64)] = &[
    (
        "PLTR",
        &[
            ("A", 1.0),
            ("B", 1.0),
            ("C", 0.0),
            ("D", 2.0),
            ("E", 1.5),
            ("F", 0.0),
            ("G", -2.0),
            ("H", 0.0),
            ("I", 0.0),
        ],
        3.5,
    ),
    (
        "NVDA",
        &[
            ("A", 1.0),
            ("B", 1.0),
            ("C", 0.0),
            ("D", 2.0),
            ("E", 1.5),
            ("F", 0.0),
            ("G", -2.0),
            ("H", 0.0),
            ("I", 0.0),
        ],
        3.5,
    ),
    (
        "HOOD",
        &[
            ("A", 0.5),
            ("B", 0.0),
            ("C", 0.0),
            ("D", 0.5),
            ("E", 1.5),
            ("F", 0.0),
            ("G", -2.0),
            ("H", 0.0),
            ("I", 0.0),
        ],
        1.0,
    ),
];

struct EpModelResult {
    model: String,
    /// Per-stock: (symbol, score, ref_score, elapsed, criteria_deviation)
    stocks: Vec<(String, f64, f64, Duration, f64)>,
    total_deviation: f64,
}

#[tokio::test]
async fn test_ep_model_benchmark() -> Result<()> {
    crate::db::init().await?;

    let client = reqwest::Client::new();
    let tags: TagsResponse = client
        .get(format!("{OLLAMA_HOST}/api/tags"))
        .send()
        .await?
        .json()
        .await?;

    let model_names: Vec<&str> = tags.models.iter().map(|m| m.name.as_str()).collect();
    eprintln!(
        "\nEP benchmark — {} stocks × {} models",
        EP_REFERENCES.len(),
        model_names.len()
    );
    eprintln!("Found models: {model_names:?}\n");

    let mut model_results: Vec<EpModelResult> = vec![];

    for model in &tags.models {
        eprintln!("═════════════════════════════════════════════════════");
        eprintln!("Model: {}", model.name);
        eprintln!("═════════════════════════════════════════════════════");

        let scorer = super::Scorer::new_custom_ollama(OLLAMA_HOST, model.name.clone());
        let mut stock_results: Vec<(String, f64, f64, Duration, f64)> = vec![];

        for (symbol, ref_criteria, ref_score) in EP_REFERENCES {
            eprintln!("\n── {symbol} (ref={ref_score:.1}) ──");
            let t0 = Instant::now();

            match scorer.evaluate_score(EP_WATCHLIST_ID, symbol).await {
                Ok(score) => {
                    let elapsed = t0.elapsed();
                    let deviation: f64 = ref_criteria
                        .iter()
                        .map(|(key, ref_val)| {
                            let model_val = score
                                .criteria
                                .get(*key)
                                .and_then(|v| v.split(" — ").next())
                                .and_then(|s| s.parse::<f64>().ok())
                                .unwrap_or(0.0);
                            (model_val - ref_val).abs()
                        })
                        .sum();

                    eprintln!(
                        "Score: {:.1}  (ref={ref_score:.1}, Δ={:+.1})  dev={deviation:.1}  {:.1}s",
                        score.score,
                        score.score - ref_score,
                        elapsed.as_secs_f64()
                    );

                    let mut criteria: Vec<_> = score.criteria.iter().collect();
                    criteria.sort_by_key(|(k, _)| k.as_str());
                    for (k, v) in &criteria {
                        if !EP_CRITERIA_KEYS.contains(&k.as_str()) {
                            continue;
                        }
                        let r = ref_criteria
                            .iter()
                            .find(|(rk, _)| rk == k)
                            .map(|(_, rv)| *rv);
                        let m = v.split(" — ").next().and_then(|s| s.parse::<f64>().ok());
                        let diff = match (m, r) {
                            (Some(mv), Some(rv)) if (mv - rv).abs() > f64::EPSILON => {
                                format!("  ← ref={rv}")
                            }
                            _ => String::new(),
                        };
                        eprintln!("  {k}: {v}{diff}");
                    }

                    stock_results.push((
                        symbol.to_string(),
                        score.score,
                        *ref_score,
                        elapsed,
                        deviation,
                    ));
                }
                Err(e) => eprintln!("ERROR {symbol}: {e:#}"),
            }
        }

        let total_deviation: f64 = stock_results.iter().map(|(_, _, _, _, d)| d).sum();
        model_results.push(EpModelResult {
            model: model.name.clone(),
            stocks: stock_results,
            total_deviation,
        });
        eprintln!();
    }

    model_results.sort_by(|a, b| {
        a.total_deviation
            .partial_cmp(&b.total_deviation)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    eprintln!(
        "═══════════════════════════════════════════════════════════════════════════════════"
    );
    eprintln!("  EP RESULTS  —  PLTR/NVDA/HOOD  (refs: 3.5 / 3.5 / 1.0)");
    eprintln!(
        "  {:<35}  {:^23}  {:>8}",
        "model", "PLTR  NVDA  HOOD  (Δref)", "tot_dev"
    );
    eprintln!(
        "───────────────────────────────────────────────────────────────────────────────────"
    );
    for (i, r) in model_results.iter().enumerate() {
        let stock_cols: String = r
            .stocks
            .iter()
            .map(|(_, score, ref_score, _, _)| format!("{score:.1}({:+.1})", score - ref_score))
            .collect::<Vec<_>>()
            .join("  ");
        eprintln!(
            "{}. {:<35}  {}  {:>7.1}",
            i + 1,
            r.model,
            stock_cols,
            r.total_deviation
        );
    }
    eprintln!("  (ranked by total per-criterion deviation across all 3 stocks)");
    eprintln!(
        "═══════════════════════════════════════════════════════════════════════════════════"
    );

    Ok(())
}

const OLLAMA_HOST: &str = "http://192.168.1.235:11434";
const VCP_CRITERIA_KEYS: &[&str] = &["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

// Claude's reference scoring for GOOG (watchlist_id=2) against the VCP prompt.
// A=2   (all 4 quarters profitable: Q1–Q4 '25 all EPS > 0)
// B=3   (all 4 quarters positive YoY EPS growth: +48.7%, +22.2%, +35.4%, +31.2%)
// C=2   (all 4 quarters positive YoY revenue growth: +12%, +13.8%, +15.9%, +18%)
// D=0.5 (forward EPS growth = (11.47-10.81)/10.81 = 6.1%, ≥5% but <10%)
// E=0   (Q4 '24 operating margin not explicitly stated as % in release)
// F=0   (only capex guidance; no revenue/EPS guidance raised vs prior)
// G=1   (bull_ratio=(58+6)/73=0.877 ≥ 0.70, upside=38.99% ≥ 15%)
// H=-2  (REGULATORY + MACRO flagged)
// I=-1  ($2.1B non-recurring Waymo employee compensation charge)
// J=0   (both 2024=8.04 and 2025=10.81 annual EPS positive, no inflection)
// Total: 5.5
const REFERENCE_CRITERIA: &[(&str, f64)] = &[
    ("A", 2.0),
    ("B", 3.0),
    ("C", 2.0),
    ("D", 0.5),
    ("E", 0.0),
    ("F", 0.0),
    ("G", 1.0),
    ("H", -2.0),
    ("I", -1.0),
    ("J", 0.0),
];
const REFERENCE_SCORE: f64 = 5.5;
const BENCHMARK_SYMBOL: &str = "GOOG";
const BENCHMARK_WATCHLIST_ID: i64 = 2;

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<ModelInfo>,
}

#[derive(Deserialize)]
struct ModelInfo {
    name: String,
}

struct ModelResult {
    model: String,
    score: f64,
    elapsed: Duration,
    criteria_count: usize,
    all_keys_present: bool,
    score_in_range: bool,
    score_is_half_step: bool,
    reasons_non_empty: bool,
    /// Sum of |model_criterion_score - reference_criterion_score| across all criteria
    criteria_deviation: f64,
}

#[tokio::test]
async fn test_vcp_model_benchmark() -> Result<()> {
    crate::db::init().await?;

    let symbol = BENCHMARK_SYMBOL;
    let watchlist_id = BENCHMARK_WATCHLIST_ID;

    eprintln!("\nBenchmarking VCP score for {symbol} (watchlist_id={watchlist_id})");

    // Fetch available models from Ollama
    let client = reqwest::Client::new();
    let tags: TagsResponse = client
        .get(format!("{OLLAMA_HOST}/api/tags"))
        .send()
        .await?
        .json()
        .await?;

    let model_names: Vec<&str> = tags.models.iter().map(|m| m.name.as_str()).collect();
    eprintln!("Found {} models: {model_names:?}\n", model_names.len());

    let mut results: Vec<ModelResult> = vec![];

    for model in &tags.models {
        eprintln!("─────────────────────────────────────────");
        eprintln!("Model: {}", model.name);
        eprintln!("─────────────────────────────────────────");

        let scorer = super::Scorer::new_custom_ollama(OLLAMA_HOST, model.name.clone());
        let t0 = Instant::now();

        match scorer.evaluate_score(watchlist_id, &symbol).await {
            Ok(score) => {
                let elapsed = t0.elapsed();

                let all_keys_present = VCP_CRITERIA_KEYS
                    .iter()
                    .all(|k| score.criteria.contains_key(*k));
                let score_in_range = score.score >= 1.0 && score.score <= 10.0;
                let score_is_half_step = (score.score * 2.0).fract() == 0.0;
                let reasons_non_empty = score.criteria.values().all(|v| !v.is_empty());

                // Per-criterion deviation from reference
                let criteria_deviation: f64 = REFERENCE_CRITERIA
                    .iter()
                    .map(|(key, ref_val)| {
                        let model_val = score
                            .criteria
                            .get(*key)
                            .and_then(|v| v.split(" — ").next())
                            .and_then(|s| s.parse::<f64>().ok())
                            .unwrap_or(0.0);
                        (model_val - ref_val).abs()
                    })
                    .sum();

                eprintln!(
                    "VCP Score : {:.1}  (reference: {REFERENCE_SCORE:.1}, Δ={:+.1})",
                    score.score,
                    score.score - REFERENCE_SCORE
                );
                eprintln!("Time      : {:.1}s", elapsed.as_secs_f64());
                let mut criteria: Vec<_> = score.criteria.iter().collect();
                criteria.sort_by_key(|(k, _)| k.as_str());
                for (k, v) in &criteria {
                    let ref_val = REFERENCE_CRITERIA
                        .iter()
                        .find(|(rk, _)| rk == k)
                        .map(|(_, rv)| *rv);
                    let model_val = v.split(" — ").next().and_then(|s| s.parse::<f64>().ok());
                    let diff = match (model_val, ref_val) {
                        (Some(m), Some(r)) if (m - r).abs() > f64::EPSILON => {
                            format!("  ← ref={r}")
                        }
                        _ => String::new(),
                    };
                    eprintln!("  {k}: {v}{diff}");
                }

                results.push(ModelResult {
                    model: model.name.clone(),
                    score: score.score,
                    elapsed,
                    criteria_count: score.criteria.len(),
                    all_keys_present,
                    score_in_range,
                    score_is_half_step,
                    reasons_non_empty,
                    criteria_deviation,
                });
            }
            Err(e) => eprintln!("ERROR: {e:#}"),
        }
        eprintln!();
    }

    // Sort by closest to reference (lowest criteria_deviation)
    results.sort_by(|a, b| {
        a.criteria_deviation
            .partial_cmp(&b.criteria_deviation)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    eprintln!("═══════════════════════════════════════════════════════════════════════════════");
    eprintln!("  RESULTS  —  {symbol}  (reference score: {REFERENCE_SCORE:.1})");
    eprintln!(
        "  {:<35} {:>5}  {:>5}  {:>6}  {:>5}  keys range  0.5x  rsns",
        "model", "score", "Δref", "time", "crit"
    );
    eprintln!("───────────────────────────────────────────────────────────────────────────────");
    for (i, r) in results.iter().enumerate() {
        eprintln!(
            "{}. {:<35} {:>5.1}  {:>+5.1}  {:>5.1}s  {:>5}  {:^4}  {:^5}  {:^4}  {:^4}",
            i + 1,
            r.model,
            r.score,
            r.score - REFERENCE_SCORE,
            r.elapsed.as_secs_f64(),
            r.criteria_count,
            if r.all_keys_present { "✓" } else { "✗" },
            if r.score_in_range { "✓" } else { "✗" },
            if r.score_is_half_step { "✓" } else { "✗" },
            if r.reasons_non_empty { "✓" } else { "✗" },
        );
    }
    eprintln!("  (ranked by sum of per-criterion deviation from reference)");
    eprintln!("═══════════════════════════════════════════════════════════════════════════════");

    Ok(())
}
