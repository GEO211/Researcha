-- Capstone alignment migration

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS severity_level VARCHAR(20) DEFAULT 'moderate'
  CHECK (severity_level IN ('low', 'moderate', 'high', 'critical'));

ALTER TABLE evaluation_responses ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(40);
ALTER TABLE evaluation_responses ADD COLUMN IF NOT EXISTS rating INT;

ALTER TABLE evaluation_responses DROP CONSTRAINT IF EXISTS evaluation_responses_survey_type_check;
ALTER TABLE evaluation_responses ADD CONSTRAINT evaluation_responses_survey_type_check
  CHECK (survey_type IN ('sus', 'tam', 'patient_satisfaction'));

ALTER TABLE priority_rules DROP CONSTRAINT IF EXISTS priority_rules_category_check;
ALTER TABLE priority_rules ADD CONSTRAINT priority_rules_category_check
  CHECK (category IN ('clinical_urgency', 'demographic', 'referral_type', 'severity'));

INSERT INTO priority_rules (name, category, condition_key, score_value, is_active)
VALUES
  ('Low severity', 'severity', 'low', 5, TRUE),
  ('Moderate severity', 'severity', 'moderate', 15, TRUE),
  ('High severity', 'severity', 'high', 35, TRUE),
  ('Critical severity', 'severity', 'critical', 60, TRUE)
ON CONFLICT DO NOTHING;
