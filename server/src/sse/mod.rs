use axum::response::sse::Event;
use std::{
    convert::Infallible,
    sync::{Mutex, OnceLock},
    time::Duration,
};
use tokio::sync::mpsc;
use tokio_stream::{Stream, StreamExt, wrappers::ReceiverStream};

const CHANNEL_BUFFER: usize = 128;

#[derive(Clone)]
pub enum SseMessage {
    Heartbeat,
    Quote(String),
}

static CLIENTS: OnceLock<Mutex<Vec<mpsc::Sender<SseMessage>>>> = OnceLock::new();

pub fn init() {
    CLIENTS
        .set(Mutex::new(Vec::new()))
        .expect("SSE already initialized");

    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            broadcast(SseMessage::Heartbeat);
        }
    });
}

pub fn subscribe() -> impl Stream<Item = Result<Event, Infallible>> {
    let (tx, rx) = mpsc::channel(CHANNEL_BUFFER);
    CLIENTS.get().unwrap().lock().unwrap().push(tx);

    ReceiverStream::new(rx).map(|msg| {
        Ok(match msg {
            SseMessage::Heartbeat => Event::default().event("heartbeat").data(""),
            SseMessage::Quote(data) => Event::default().event("quote").data(data),
        })
    })
}

pub fn broadcast(msg: SseMessage) {
    let mut clients = CLIENTS.get().unwrap().lock().unwrap();
    clients.retain(|tx| match tx.try_send(msg.clone()) {
        Ok(_) => true,
        Err(e) => {
            tracing::debug!("Dropping SSE client: {e}");
            false
        }
    });
}
