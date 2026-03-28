use anyhow::Result;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::sync::OnceLock;

pub type Db = SqlitePool;

static POOL: OnceLock<Db> = OnceLock::new();

pub async fn init(database_path: &str) -> Result<()> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&format!("sqlite:{database_path}"))
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    POOL.set(pool).expect("DB pool already initialized");
    Ok(())
}

pub fn pool() -> &'static Db {
    POOL.get().expect("DB pool not initialized")
}
