ALTER TABLE patients ADD COLUMN IF NOT EXISTS record_status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS archive_reason VARCHAR(40);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS archive_note TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS archived_by_user_id INT REFERENCES users(id);

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_record_status_check;
ALTER TABLE patients ADD CONSTRAINT patients_record_status_check
  CHECK (record_status IN ('active', 'archived'));
