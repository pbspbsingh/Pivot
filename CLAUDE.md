# Pivot — Claude Instructions

## Project Structure

```
Pivot/
├── client/        # React + TypeScript + Vite frontend
└── server/        # Rust + Axum + SQLite backend
```

## Running the Project

```sh
# Server (port 8080)
cd server && cargo run

# Client (port 5173, proxies /api to localhost:8080)
cd client && npm run dev
```

## Server

- **Framework:** Axum 0.8
- **Database:** SQLite via sqlx 0.8 with compile-time query macros
- **Async:** Tokio
- **Config:** `server/config.toml` — read at startup into a global `LazyLock<Config>`
- **DB pool:** Global `OnceLock<SqlitePool>`, accessed via `db::pool()`
- **Migrations:** `server/migrations/`, run automatically on startup via `sqlx::migrate!()`
- **SSE:** Per-client `mpsc` channel (buffer 128), global `HashMap<u64, Sender>` registry, heartbeat every 10s
- **Error handling:** `ApiError` enum in `api/error.rs` implements `IntoResponse`

### Database reset

```sh
cd server
cargo sqlx database drop && cargo sqlx database create && cargo sqlx migrate run
```

### Key conventions
- sqlx query macros require the database to exist with correct schema before `cargo build`
- Use `BOOLEAN` / `DATETIME` SQL types — sqlx maps them to Rust `bool` / `chrono::NaiveDateTime`
- For nullable JOIN columns sqlx cannot statically verify, use `as "col!"` to assert non-null
- One write connection (`max_connections=1`), WAL journal mode, `synchronous=NORMAL`
- Log all mutating operations with structured tracing fields; skip read-only handlers

## Client

- **UI library:** Mantine v7 (dark theme by default)
- **State:** Zustand — global store in `src/store/index.ts`
- **Routing:** React Router v6 — routes: `/`, `/stock/{id}`, `/settings`
- **API calls:** `src/api/index.ts` — all calls go through `request()`, proxied to server via Vite
- **SSE connection:** `useServerEvents` hook in `src/hooks/` — manages `EventSource` with exponential backoff reconnect
- **Tab orientation:** Stored in `localStorage`, read into Zustand on init
- **Shared state:** Watchlists, stocks-per-watchlist, and nav expand state live in Zustand; Layout fetches watchlists on mount (always rendered), Home and WatchlistPanel mutate the store

### Key conventions
- No CSS-in-JS, no Tailwind — use Mantine component props for styling
- Keep pages in `src/pages/<PageName>/`, shared components in `src/components/`
- Soft-delete stocks via API immediately; keep row visible with strikethrough until navigation
- All async API calls wrapped in try/catch; errors shown via `notifyError()` from `src/utils/notify.ts`
- Ctrl+Enter / Cmd+Enter submits textarea forms
- Ticker input splits on newlines, commas, and spaces; each token is trimmed and uppercased
- Nav expand state persisted to `localStorage` under key `watchlistExpanded`
- Icon input accepts emoji only — validated via `Intl.Segmenter`, rejects plain ASCII

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/events` | SSE stream |
| GET | `/api/watchlists` | List watchlists |
| POST | `/api/watchlists` | Create watchlist |
| PATCH | `/api/watchlists/{id}` | Rename/edit watchlist |
| DELETE | `/api/watchlists/{id}` | Delete watchlist |
| GET | `/api/watchlists/{id}/stocks` | List active stocks |
| POST | `/api/watchlists/{id}/stocks` | Add stocks |
| DELETE | `/api/watchlists/{id}/stocks/{symbol}` | Soft-delete stock |
| POST | `/api/watchlists/{id}/stocks/{symbol}/restore` | Restore stock |

## Business Rules

- "Episodic Pivot" is the default watchlist — cannot be renamed or deleted; icon is 🚀
- Each watchlist has an emoji icon (`emoji` column, default 📋); set by client on create/edit
- Removing a stock soft-deletes it (`deleted_at`) to preserve metadata
- EP Score only applies to the "Episodic Pivot" watchlist; VCP Score applies to all others
- Score column label changes dynamically based on the active watchlist
- Watchlists sorted by `created_at ASC` (default watchlist always first via `is_default DESC`)
