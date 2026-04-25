CREATE TABLE notes (
    symbol     TEXT     PRIMARY KEY,
    content    TEXT     NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE note_images (
    id         INTEGER  PRIMARY KEY AUTOINCREMENT,
    symbol     TEXT     NOT NULL,
    data       BLOB     NOT NULL,
    mime       TEXT     NOT NULL DEFAULT 'image/jpeg',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
