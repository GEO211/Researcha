CREATE TABLE IF NOT EXISTS visit_ratings (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  referral_id INT NOT NULL REFERENCES referrals(id),
  queue_entry_id INT REFERENCES queue_entries(id),
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comments TEXT,
  categories JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_visit_ratings_referral UNIQUE (referral_id)
);

CREATE INDEX IF NOT EXISTS idx_visit_ratings_patient ON visit_ratings (patient_id);
