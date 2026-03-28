CREATE TABLE watchlists (
    id         INTEGER  PRIMARY KEY AUTOINCREMENT,
    name       TEXT     NOT NULL UNIQUE,
    is_default BOOLEAN  NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE stocks (
    symbol           TEXT     PRIMARY KEY,
    sector           TEXT,
    industry         TEXT,
    ep_score         REAL,
    vcp_score        REAL,
    score_updated_at DATETIME,
    created_at       DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE watchlist_stocks (
    watchlist_id INTEGER  NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    symbol       TEXT     NOT NULL REFERENCES stocks(symbol) ON DELETE CASCADE,
    deleted_at   DATETIME,
    PRIMARY KEY (watchlist_id, symbol)
);

INSERT INTO watchlists (name, is_default) VALUES ('Episodic Pivot', TRUE);
