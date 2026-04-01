CREATE TABLE watchlists (
    id         INTEGER  PRIMARY KEY AUTOINCREMENT,
    name       TEXT     NOT NULL UNIQUE,
    is_default BOOLEAN  NOT NULL DEFAULT FALSE,
    emoji      TEXT     NOT NULL DEFAULT '📋',
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE stocks (
    symbol     TEXT     PRIMARY KEY,
    exchange   TEXT     NOT NULL,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE watchlist_stocks (
    watchlist_id INTEGER  NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    symbol       TEXT     NOT NULL REFERENCES stocks(symbol) ON DELETE CASCADE,
    deleted_at   DATETIME,
    added_at     DATETIME NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (watchlist_id, symbol)
);

INSERT INTO watchlists (name, is_default, emoji) VALUES ('Episodic Pivot', TRUE, '🚀');
