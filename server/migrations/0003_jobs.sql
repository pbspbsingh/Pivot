CREATE TABLE analysis_jobs (
    id           INTEGER  PRIMARY KEY AUTOINCREMENT,
    symbol       TEXT     NOT NULL,
    watchlist_id INTEGER  NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    status       TEXT     NOT NULL DEFAULT 'pending',
    current_step TEXT     NOT NULL DEFAULT 'queued',
    error        TEXT,
    created_at   DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at   DATETIME NOT NULL DEFAULT (datetime('now'))
);
-- CREATE INDEX idx_analysis_jobs_watchlist_symbol_id
--    ON analysis_jobs (watchlist_id, symbol, id DESC);

CREATE TABLE job_step_data (
    job_id   INTEGER  NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    step     TEXT     NOT NULL,
    payload  JSON     NOT NULL,
    saved_at DATETIME NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (job_id, step)
);

CREATE TABLE job_step_attempts (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    job_id      INTEGER  NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    step        TEXT     NOT NULL,
    attempt     INTEGER  NOT NULL,
    status      TEXT     NOT NULL,
    error       TEXT,
    duration_ms INTEGER,
    started_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);
