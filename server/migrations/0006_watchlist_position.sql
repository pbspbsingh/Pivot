ALTER TABLE watchlists ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Initialize positions for non-default watchlists based on created_at order.
WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1 AS pos
    FROM watchlists
    WHERE is_default = FALSE
)
UPDATE watchlists
SET position = (SELECT pos FROM ordered WHERE ordered.id = watchlists.id)
WHERE is_default = FALSE;
