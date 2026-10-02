-- CareLink Supabase / PostgreSQL schema

CREATE TABLE IF NOT EXISTS health_centers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('barangay', 'city')),
  address VARCHAR(255) NOT NULL,
  contact_number VARCHAR(30),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  barangay_name VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  health_center_id INT REFERENCES health_centers(id),
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  contact_number VARCHAR(30),
  avatar TEXT,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL CHECK (role IN ('super_admin', 'barangay_staff', 'city_staff')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  health_center_id INT NOT NULL REFERENCES health_centers(id),
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  birth_date DATE NOT NULL,
  sex VARCHAR(10) NOT NULL CHECK (sex IN ('female', 'male', 'other')),
  contact_number VARCHAR(30),
  email VARCHAR(150),
  address VARCHAR(255) NOT NULL,
  address2 VARCHAR(255),
  city VARCHAR(100),
  postal_code VARCHAR(20),
  province VARCHAR(100),
  is_senior BOOLEAN NOT NULL DEFAULT FALSE,
  is_pregnant BOOLEAN NOT NULL DEFAULT FALSE,
  is_pwd BOOLEAN NOT NULL DEFAULT FALSE,
  is_child BOOLEAN NOT NULL DEFAULT FALSE,
  is_infant BOOLEAN NOT NULL DEFAULT FALSE,
  is_indigenous BOOLEAN NOT NULL DEFAULT FALSE,
  is_solo_parent BOOLEAN NOT NULL DEFAULT FALSE,
  medical_notes TEXT,
  emergency_contact_name VARCHAR(150),
  emergency_contact_number VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_name ON patients (last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_patients_contact ON patients (contact_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_identity
  ON patients (lower(btrim(first_name)), lower(btrim(last_name)), birth_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_contact
  ON patients (regexp_replace(contact_number, '\D', '', 'g'))
  WHERE contact_number IS NOT NULL AND btrim(contact_number) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_email
  ON patients (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  referral_code VARCHAR(40) NOT NULL UNIQUE,
  patient_id INT NOT NULL REFERENCES patients(id),
  referring_health_center_id INT NOT NULL REFERENCES health_centers(id),
  receiving_health_center_id INT NOT NULL REFERENCES health_centers(id),
  submitted_by_user_id INT NOT NULL REFERENCES users(id),
  reviewed_by_user_id INT REFERENCES users(id),
  referral_reason TEXT NOT NULL,
  clinical_urgency VARCHAR(20) NOT NULL CHECK (clinical_urgency IN ('emergency', 'urgent', 'routine')),
  referral_type VARCHAR(40) NOT NULL CHECK (referral_type IN ('emergency', 'specialist_consultation', 'follow_up', 'routine')),
  severity_level VARCHAR(20) NOT NULL DEFAULT 'moderate' CHECK (severity_level IN ('low', 'moderate', 'high', 'critical')),
  status VARCHAR(30) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'queued', 'completed', 'missed', 'archived', 'expired')),
  rejection_reason TEXT,
  appointment_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals (status);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals (referral_code);

CREATE TABLE IF NOT EXISTS queue_entries (
  id SERIAL PRIMARY KEY,
  referral_id INT NOT NULL UNIQUE REFERENCES referrals(id),
  patient_id INT NOT NULL REFERENCES patients(id),
  queue_number VARCHAR(30) NOT NULL,
  priority_level VARCHAR(40) NOT NULL CHECK (priority_level IN ('priority_1_emergency', 'priority_2_vulnerable', 'priority_3_standard')),
  priority_score INT NOT NULL,
  queue_status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (queue_status IN ('waiting', 'called', 'served', 'missed', 'cancelled', 'expired')),
  queue_date DATE NOT NULL,
  called_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  missed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_date ON queue_entries (queue_date);
CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_entries (queue_status);

CREATE TABLE IF NOT EXISTS priority_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN ('clinical_urgency', 'demographic', 'referral_type', 'severity')),
  condition_key VARCHAR(100) NOT NULL,
  score_value INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_logs (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  referral_id INT REFERENCES referrals(id),
  queue_entry_id INT REFERENCES queue_entries(id),
  recipient_number VARCHAR(30) NOT NULL,
  message TEXT NOT NULL,
  trigger_type VARCHAR(40) NOT NULL CHECK (trigger_type IN ('approval', 'appointment_reminder', 'missed_referral', 'queue_call', 'manual', 'referral_completed', 'referral_booked', 'referral_cancelled', 'referral_rescheduled', 'referral_transferred')),
  provider_message_id VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_logs (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id),
  referral_id INT REFERENCES referrals(id),
  queue_entry_id INT REFERENCES queue_entries(id),
  recipient_email VARCHAR(150) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  trigger_type VARCHAR(40) NOT NULL CHECK (trigger_type IN ('appointment_reminder', 'queue_call', 'manual')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  action VARCHAR(150) NOT NULL,
  auditable_type VARCHAR(100),
  auditable_id INT,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_metrics (
  id SERIAL PRIMARY KEY,
  operation VARCHAR(100) NOT NULL,
  duration_ms INT NOT NULL,
  reference_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluation_responses (
  id SERIAL PRIMARY KEY,
  survey_type VARCHAR(30) NOT NULL CHECK (survey_type IN ('sus', 'tam', 'patient_satisfaction')),
  respondent_role VARCHAR(30) NOT NULL CHECK (respondent_role IN ('super_admin', 'barangay_staff', 'city_staff', 'patient')),
  respondent_name VARCHAR(150),
  tracking_code VARCHAR(40),
  rating INT,
  score INT NOT NULL,
  answers JSONB NOT NULL,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
