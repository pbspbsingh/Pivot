use anyhow::Result;
use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};
use std::{str::FromStr, sync::OnceLock};

pub type Db = SqlitePool;

static POOL: OnceLock<Db> = OnceLock::new();

pub async fn init(database_path: &str) -> Result<()> {
    let options = SqliteConnectOptions::from_str(&format!("sqlite:{database_path}"))?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(std::time::Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(1) // SQLite WAL supports one writer
        .min_connections(1)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    POOL.set(pool).expect("DB pool already initialized");
    Ok(())
}

pub fn pool() -> &'static Db {
    POOL.get().expect("DB pool not initialized")
}
