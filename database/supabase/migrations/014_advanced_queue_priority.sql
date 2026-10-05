ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS priority_band VARCHAR(20) NOT NULL DEFAULT 'normal';
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS severity_rank INT NOT NULL DEFAULT 2;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS severity_score INT NOT NULL DEFAULT 60;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS vulnerability_score INT NOT NULL DEFAULT 0;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS vulnerability_count INT NOT NULL DEFAULT 0;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS priority_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE queue_entries DROP CONSTRAINT IF EXISTS queue_entries_priority_band_check;
ALTER TABLE queue_entries ADD CONSTRAINT queue_entries_priority_band_check
  CHECK (priority_band IN ('critical', 'high', 'medium', 'normal'));

CREATE INDEX IF NOT EXISTS idx_queue_advanced_priority
  ON queue_entries (queue_status, priority_score DESC, severity_rank DESC, vulnerability_count DESC, created_at ASC);
