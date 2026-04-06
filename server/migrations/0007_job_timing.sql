ALTER TABLE analysis_jobs ADD COLUMN phase_started_at DATETIME;
ALTER TABLE analysis_jobs ADD COLUMN accumulated_ms INTEGER NOT NULL DEFAULT 0;
