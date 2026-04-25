use std::collections::HashSet;

use chrono::{Local, NaiveTime, Timelike};
use tokio::time::{Duration, Instant, sleep};

use crate::{config::CONFIG, db, pipeline::tradingview, sse};

const SCRAPE_START: (u32, u32) = (6, 0);
const SCRAPE_END: (u32, u32) = (6, 35);
const SCRAPE_INTERVAL: Duration = Duration::from_secs(5 * 60);

pub fn start() {
    let Some(cfg) = CONFIG.tv_watchlist.as_ref() else {
        return;
    };
    let url = cfg.url.clone();

    tokio::spawn(async move {
        loop {
            sleep(secs_until_start()).await;
            run_morning_scrape(&url).await;
        }
    });
}

async fn run_morning_scrape(url: &str) {
    let ep_id = match get_ep_watchlist_id().await {
        Some(id) => id,
        None => {
            tracing::error!("EP watchlist not found, skipping morning scrape");
            return;
        }
    };

    let mut first_run = true;

    loop {
        if first_run {
            if let Err(e) = db::watchlists::soft_delete_previous_scrape(ep_id).await {
                tracing::error!("Failed to clear previous scrape from EP watchlist: {e}");
            } else {
                sse::broadcast_snapshot().await;
            }
            first_run = false;
        }

        let run_start = Instant::now();

        match scrape_and_enqueue(ep_id, url).await {
            Ok(n) => {
                tracing::info!(ep_id, n, "Scrape run complete");
                sse::broadcast_snapshot().await;
            }
            Err(e) => tracing::error!("Scrape run failed: {e:#}"),
        }

        if past_scrape_end() {
            break;
        }

        let elapsed = run_start.elapsed();
        if let Some(remaining) = SCRAPE_INTERVAL.checked_sub(elapsed) {
            sleep(remaining).await;
        }

        if past_scrape_end() {
            break;
        }
    }
}

pub async fn scrape_and_enqueue(ep_id: i64, url: &str) -> anyhow::Result<usize> {
    let existing: HashSet<String> = db::watchlists::list_stocks(ep_id)
        .await?
        .into_iter()
        .map(|s| s.symbol)
        .collect();

    let stocks = {
        let mut tv = tradingview::instance().await?.lock().await;
        tv.fetch_watchlist_tickers(url).await?
    };

    if stocks.is_empty() {
        return Ok(0);
    }

    let n = stocks.len();
    db::watchlists::add_scrape_stocks(ep_id, &stocks).await?;

    for stock in &stocks {
        if existing.contains(&stock.symbol) {
            continue;
        }
        if let Err(e) = db::jobs::enqueue(&stock.symbol, ep_id).await {
            tracing::warn!(symbol = stock.symbol, "Failed to enqueue: {e}");
        }
    }

    Ok(n)
}

async fn get_ep_watchlist_id() -> Option<i64> {
    match db::watchlists::list().await {
        Ok(watchlists) => watchlists.into_iter().find(|w| w.is_default).map(|w| w.id),
        Err(e) => {
            tracing::error!("Failed to list watchlists: {e}");
            None
        }
    }
}

fn secs_until_start() -> Duration {
    use chrono::Datelike;
    use chrono::Weekday;

    let now = Local::now();
    let target = NaiveTime::from_hms_opt(SCRAPE_START.0, SCRAPE_START.1, 0).unwrap();
    let now_time = now.time();

    // Days to advance: 0 if today is a weekday before the start time, otherwise
    // skip to the next Monday if we'd land on a weekend.
    let today_is_weekend = matches!(now.weekday(), Weekday::Sat | Weekday::Sun);
    let past_start_today = now_time >= target;

    let extra_days: i64 = if !today_is_weekend && !past_start_today {
        0
    } else {
        // How many days until the next weekday start
        let days_forward = if past_start_today || today_is_weekend {
            1
        } else {
            0
        };
        let next_weekday_days = (1..=7).map(|d| d as i64).find(|&d| {
            let next = now.weekday().num_days_from_monday() as i64 + days_forward + d - 1;
            !matches!(next % 7, 5 | 6) // 5=Sat, 6=Sun
        });
        next_weekday_days.unwrap_or(1)
    };

    let secs_remaining_today = 86400 - now_time.num_seconds_from_midnight() as i64;
    let secs = if extra_days == 0 {
        (target - now_time).num_seconds()
    } else {
        secs_remaining_today + (extra_days - 1) * 86400 + target.num_seconds_from_midnight() as i64
    };

    Duration::from_secs(secs.max(0) as u64)
}

fn past_scrape_end() -> bool {
    let now = Local::now().time();
    let end = NaiveTime::from_hms_opt(SCRAPE_END.0, SCRAPE_END.1, 0).unwrap();
    now >= end
}
