CREATE TABLE stock_analysis (
    symbol       TEXT     NOT NULL,
    watchlist_id INTEGER  NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    basic_info   JSON     NOT NULL,
    earnings     JSON     NOT NULL,
    forecast     JSON     NOT NULL,
    document     JSON     NOT NULL,
    analyzed_at  DATETIME NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (symbol, watchlist_id)
);
