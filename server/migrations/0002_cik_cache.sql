CREATE TABLE cik_cache (
    symbol    TEXT     PRIMARY KEY,
    cik       TEXT     NOT NULL,
    cached_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
