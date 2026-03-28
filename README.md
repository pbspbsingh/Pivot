# Pivot

> A personal stock research and trading intelligence platform.

Pivot is a locally-run application for managing the full cycle of momentum trading — from screening and fundamental research to signal detection and trade notes. Built for speed, precision, and full ownership of your data.

## What it does

- **Watchlists** — Track EP and VCP setups with scoring, sector/industry context, and TradingView chart integration
- **Screening** — Identify episodic pivot and momentum candidates from earnings and fundamental data
- **Research** — Browse fundamentals, analyst estimates, earnings history, and insider activity per stock
- **Signals** — Live pre-market monitoring via Schwab WebSocket streaming with RVOL alerts
- **Scoring** — LLM-powered CANSLIM, SEPA, and EP scoring from structured fundamental data
- **Notes** — Annotate stocks with observations, thesis, and trade rationale

## Stack

| Layer | Technology |
|---|---|
| Backend | Rust · Axum · SQLite |
| Frontend | React · TypeScript · Vite |
| Streaming | Schwab WebSocket API |
| Scoring | DeepSeek V3 |
| Charts | TradingView |

## Philosophy

Built around the trading frameworks of Qullamaggie, William O'Neil, and Mark Minervini — Pivot is designed to surface high-conviction momentum setups and keep your research and instincts in one place.


