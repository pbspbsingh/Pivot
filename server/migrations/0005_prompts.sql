CREATE TABLE prompts (
    key        TEXT     PRIMARY KEY,
    content    TEXT     NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
