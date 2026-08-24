ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_child BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_infant BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_indigenous BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_solo_parent BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO priority_rules (name, category, condition_key, score_value, is_active)
SELECT 'Child patient', 'demographic', 'is_child', 20, TRUE
WHERE NOT EXISTS (SELECT 1 FROM priority_rules WHERE condition_key = 'is_child');

INSERT INTO priority_rules (name, category, condition_key, score_value, is_active)
SELECT 'Infant patient', 'demographic', 'is_infant', 25, TRUE
WHERE NOT EXISTS (SELECT 1 FROM priority_rules WHERE condition_key = 'is_infant');

INSERT INTO priority_rules (name, category, condition_key, score_value, is_active)
SELECT 'Indigenous patient', 'demographic', 'is_indigenous', 15, TRUE
WHERE NOT EXISTS (SELECT 1 FROM priority_rules WHERE condition_key = 'is_indigenous');

INSERT INTO priority_rules (name, category, condition_key, score_value, is_active)
SELECT 'Solo parent', 'demographic', 'is_solo_parent', 15, TRUE
WHERE NOT EXISTS (SELECT 1 FROM priority_rules WHERE condition_key = 'is_solo_parent');
