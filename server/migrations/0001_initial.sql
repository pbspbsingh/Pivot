CREATE TABLE IF NOT EXISTS watchlists (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist_stocks (
    watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    symbol       TEXT NOT NULL,
    PRIMARY KEY (watchlist_id, symbol)
);
