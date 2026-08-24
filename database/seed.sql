USE carelink;

INSERT INTO health_centers (id, name, type, address, contact_number, status)
VALUES
  (1, 'Koronadal City Health Center', 'city', 'Koronadal City, South Cotabato', '09170000001', 'active'),
  (2, 'Barangay Zone I Health Center', 'barangay', 'Barangay Zone I, Koronadal City', '09170000002', 'active'),
  (3, 'Barangay Sta. Cruz Health Center', 'barangay', 'Barangay Sta. Cruz, Koronadal City', '09170000003', 'active')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  type = VALUES(type),
  address = VALUES(address),
  contact_number = VALUES(contact_number),
  status = VALUES(status);

-- Password for all default users: password123
-- Replace these accounts before production use.
INSERT INTO users (id, health_center_id, name, email, password, role, status)
VALUES
  (1, NULL, 'Super Admin', 'admin@carelink.local', '$2b$10$YvzSi41A7NYDGB.i9eenMOk8WnLO7/IMkE8BXOpJtFOoynEIL.bjG', 'super_admin', 'active'),
  (2, 2, 'Barangay Staff', 'barangay@carelink.local', '$2b$10$YvzSi41A7NYDGB.i9eenMOk8WnLO7/IMkE8BXOpJtFOoynEIL.bjG', 'barangay_staff', 'active'),
  (3, 1, 'City Staff', 'city@carelink.local', '$2b$10$YvzSi41A7NYDGB.i9eenMOk8WnLO7/IMkE8BXOpJtFOoynEIL.bjG', 'city_staff', 'active')
ON DUPLICATE KEY UPDATE
  health_center_id = VALUES(health_center_id),
  name = VALUES(name),
  password = VALUES(password),
  role = VALUES(role),
  status = VALUES(status);

INSERT INTO priority_rules (name, category, condition_key, score_value, is_active)
VALUES
  ('Emergency clinical urgency', 'clinical_urgency', 'emergency', 100, TRUE),
  ('Urgent clinical urgency', 'clinical_urgency', 'urgent', 60, TRUE),
  ('Routine clinical urgency', 'clinical_urgency', 'routine', 20, TRUE),
  ('Senior citizen', 'demographic', 'is_senior', 25, TRUE),
  ('Pregnant patient', 'demographic', 'is_pregnant', 25, TRUE),
  ('Person with disability', 'demographic', 'is_pwd', 25, TRUE),
  ('Child patient', 'demographic', 'is_child', 20, TRUE),
  ('Infant patient', 'demographic', 'is_infant', 25, TRUE),
  ('Indigenous patient', 'demographic', 'is_indigenous', 15, TRUE),
  ('Solo parent', 'demographic', 'is_solo_parent', 15, TRUE),
  ('Emergency referral type', 'referral_type', 'emergency', 50, TRUE),
  ('Specialist consultation', 'referral_type', 'specialist_consultation', 30, TRUE),
  ('Follow-up referral', 'referral_type', 'follow_up', 15, TRUE),
  ('Routine referral', 'referral_type', 'routine', 5, TRUE);

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES
  ('sms.approval.enabled', 'true', 'Send SMS after referral approval and queue assignment'),
  ('sms.reminder.enabled', 'true', 'Send SMS 24 hours before appointment'),
  ('sms.missed.enabled', 'true', 'Send SMS when referral visit is missed'),
  ('priority.emergency.threshold', '100', 'Minimum score for Priority 1 Emergency'),
  ('priority.vulnerable.threshold', '50', 'Minimum score for Priority 2 Vulnerable Group')
ON DUPLICATE KEY UPDATE
  setting_value = VALUES(setting_value),
  description = VALUES(description);
