use axum::response::sse::Event;
use std::{
    collections::HashMap,
    convert::Infallible,
    sync::{
        atomic::{AtomicU64, Ordering},
        LazyLock, Mutex,
    },
    time::Duration,
};
use tokio::sync::mpsc;
use tokio_stream::{wrappers::ReceiverStream, Stream, StreamExt};

const CHANNEL_BUFFER: usize = 128;

#[derive(Clone)]
pub enum SseMessage {
    Heartbeat,
    Quote(String),
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

pub fn subscribe() -> impl Stream<Item = Result<Event, Infallible>> {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel(CHANNEL_BUFFER);
    CLIENTS.lock().unwrap().insert(id, tx);
    tracing::debug!("SSE client {id} connected");

    ReceiverStream::new(rx).map(|msg| {
        Ok(match msg {
            SseMessage::Heartbeat => Event::default().event("heartbeat").data(""),
            SseMessage::Quote(data) => Event::default().event("quote").data(data),
        })
    })
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
