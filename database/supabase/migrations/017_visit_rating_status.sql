CREATE TABLE IF NOT EXISTS visit_ratings (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  referral_id INT NOT NULL REFERENCES referrals(id),
  queue_entry_id INT REFERENCES queue_entries(id),
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comments TEXT,
  categories JSONB NOT NULL DEFAULT '{}'::jsonb,
  internal_status VARCHAR(30) NOT NULL DEFAULT 'new',
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_visit_ratings_referral UNIQUE (referral_id)
);

ALTER TABLE visit_ratings ADD COLUMN IF NOT EXISTS internal_status VARCHAR(30) NOT NULL DEFAULT 'new';
ALTER TABLE visit_ratings ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE visit_ratings ADD COLUMN IF NOT EXISTS reviewed_by_user_id INT;

CREATE INDEX IF NOT EXISTS idx_visit_ratings_patient ON visit_ratings (patient_id);
CREATE INDEX IF NOT EXISTS idx_visit_ratings_status ON visit_ratings (internal_status);
CREATE INDEX IF NOT EXISTS idx_visit_ratings_created ON visit_ratings (created_at);
