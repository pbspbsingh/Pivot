use axum::response::sse::Event;
use chrono::{Local, NaiveDateTime};

use crate::models::{JobStatus, PipelineStep, WatchlistSnapshot, jobs::JobSummary};
use std::{
    collections::HashMap,
    convert::Infallible,
    sync::{
        LazyLock, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::sync::mpsc;
use tokio_stream::{Stream, StreamExt, wrappers::ReceiverStream};

const CHANNEL_BUFFER: usize = 128;

#[derive(Clone)]
pub enum SseMessage {
    Heartbeat,
    Job(JobSummary),
    Snapshot(Vec<WatchlistSnapshot>),
}

static NEXT_ID: AtomicU64 = AtomicU64::new(0);
static CLIENTS: LazyLock<Mutex<HashMap<u64, mpsc::Sender<SseMessage>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn init() {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(10)).await;
            broadcast(SseMessage::Heartbeat);
        }
    });
}

pub async fn subscribe() -> impl Stream<Item = Result<Event, Infallible>> {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel(CHANNEL_BUFFER);
    CLIENTS.lock().unwrap().insert(id, tx.clone());
    tracing::debug!("SSE client {id} connected");

    // Heartbeat first so the client goes live immediately.
    let _ = tx.try_send(SseMessage::Heartbeat);

    // Then send a full snapshot so the client is in sync without a page reload.
    match build_snapshot().await {
        Ok(snapshot) => {
            let _ = tx.try_send(SseMessage::Snapshot(snapshot));
        }
        Err(e) => tracing::warn!("Failed to build SSE snapshot: {e}"),
    }

    ReceiverStream::new(rx).map(|msg| {
        Ok(match msg {
            SseMessage::Heartbeat => Event::default()
                .event("heartbeat")
                .data(Local::now().format("%H:%M:%S").to_string()),
            SseMessage::Job(ev) => Event::default()
                .event("job")
                .data(serde_json::to_string(&ev).unwrap_or_default()),
            SseMessage::Snapshot(s) => Event::default()
                .event("snapshot")
                .data(serde_json::to_string(&s).unwrap_or_default()),
        })
    })
}

async fn build_snapshot() -> anyhow::Result<Vec<WatchlistSnapshot>> {
    let watchlists = crate::db::watchlists::list().await?;
    let mut snapshots = Vec::with_capacity(watchlists.len());
    for watchlist in watchlists {
        let stocks = crate::db::watchlists::list_stocks(watchlist.id).await?;
        snapshots.push(WatchlistSnapshot { watchlist, stocks });
    }
    Ok(snapshots)
}

#[allow(clippy::too_many_arguments)]
pub fn broadcast_job(
    job_id: i64,
    symbol: &str,
    watchlist_id: i64,
    status: JobStatus,
    step: PipelineStep,
    error: Option<String>,
    phase_started_at: Option<NaiveDateTime>,
    accumulated_ms: i64,
) {
    broadcast(SseMessage::Job(JobSummary {
        job_id,
        symbol: symbol.to_string(),
        watchlist_id,
        status,
        step,
        error,
        phase_started_at,
        accumulated_ms,
    }));
}

pub fn broadcast(msg: SseMessage) {
    let mut clients = CLIENTS.lock().unwrap();
    clients.retain(|id, tx| match tx.try_send(msg.clone()) {
        Ok(_) => true,
        Err(e) => {
            tracing::debug!("Dropping SSE client {id}: {e}");
            false
        }
    });
}
