CREATE DATABASE IF NOT EXISTS carelink CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE carelink;

CREATE TABLE IF NOT EXISTS health_centers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  type ENUM('barangay', 'city') NOT NULL,
  address VARCHAR(255) NOT NULL,
  contact_number VARCHAR(30),
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  health_center_id INT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  contact_number VARCHAR(30),
  avatar TEXT,
  password VARCHAR(255) NOT NULL,
  role ENUM('super_admin', 'barangay_staff', 'city_staff') NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_health_center FOREIGN KEY (health_center_id) REFERENCES health_centers(id)
);

CREATE TABLE IF NOT EXISTS patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  health_center_id INT NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  birth_date DATE NOT NULL,
  sex ENUM('female', 'male', 'other') NOT NULL,
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
  record_status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  archive_reason VARCHAR(40),
  archive_note TEXT,
  archived_at TIMESTAMP NULL,
  archived_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_patients_health_center FOREIGN KEY (health_center_id) REFERENCES health_centers(id),
  INDEX idx_patients_name (last_name, first_name),
  INDEX idx_patients_contact (contact_number),
  UNIQUE KEY uq_patients_identity (last_name, first_name, birth_date)
);

CREATE TABLE IF NOT EXISTS referrals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  referral_code VARCHAR(40) NOT NULL UNIQUE,
  patient_id INT NOT NULL,
  referring_health_center_id INT NOT NULL,
  receiving_health_center_id INT NOT NULL,
  submitted_by_user_id INT NOT NULL,
  reviewed_by_user_id INT NULL,
  referral_reason TEXT NOT NULL,
  clinical_urgency ENUM('emergency', 'urgent', 'routine') NOT NULL,
  referral_type ENUM('emergency', 'specialist_consultation', 'follow_up', 'routine') NOT NULL,
  status ENUM('submitted', 'under_review', 'approved', 'rejected', 'queued', 'completed', 'missed', 'cancelled', 'archived', 'expired') NOT NULL DEFAULT 'submitted',
  rejection_reason TEXT,
  appointment_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_referrals_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_referrals_referring_center FOREIGN KEY (referring_health_center_id) REFERENCES health_centers(id),
  CONSTRAINT fk_referrals_receiving_center FOREIGN KEY (receiving_health_center_id) REFERENCES health_centers(id),
  CONSTRAINT fk_referrals_submitted_by FOREIGN KEY (submitted_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_referrals_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id),
  INDEX idx_referrals_status (status),
  INDEX idx_referrals_referring_center (referring_health_center_id),
  INDEX idx_referrals_receiving_center (receiving_health_center_id),
  INDEX idx_referrals_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS queue_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  referral_id INT NOT NULL UNIQUE,
  patient_id INT NOT NULL,
  queue_number VARCHAR(30) NOT NULL,
  priority_level ENUM('priority_1_emergency', 'priority_2_vulnerable', 'priority_3_standard') NOT NULL,
  priority_score INT NOT NULL,
  queue_status ENUM('waiting', 'called', 'served', 'missed', 'cancelled') NOT NULL DEFAULT 'waiting',
  queue_date DATE NOT NULL,
  called_at DATETIME NULL,
  served_at DATETIME NULL,
  missed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_queue_referral FOREIGN KEY (referral_id) REFERENCES referrals(id),
  CONSTRAINT fk_queue_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  INDEX idx_queue_priority (priority_level),
  INDEX idx_queue_date (queue_date),
  INDEX idx_queue_status (queue_status)
);

CREATE TABLE IF NOT EXISTS priority_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category ENUM('clinical_urgency', 'demographic', 'referral_type') NOT NULL,
  condition_key VARCHAR(100) NOT NULL,
  score_value INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sms_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  referral_id INT NULL,
  queue_entry_id INT NULL,
  recipient_number VARCHAR(30) NOT NULL,
  message TEXT NOT NULL,
  trigger_type ENUM('approval', 'appointment_reminder', 'missed_referral', 'manual') NOT NULL,
  provider_message_id VARCHAR(100),
  status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sms_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_sms_referral FOREIGN KEY (referral_id) REFERENCES referrals(id),
  CONSTRAINT fk_sms_queue FOREIGN KEY (queue_entry_id) REFERENCES queue_entries(id)
);

CREATE TABLE IF NOT EXISTS email_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  referral_id INT NULL,
  queue_entry_id INT NULL,
  recipient_email VARCHAR(150) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  trigger_type ENUM('appointment_reminder', 'manual') NOT NULL,
  status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_email_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
  CONSTRAINT fk_email_referral FOREIGN KEY (referral_id) REFERENCES referrals(id),
  CONSTRAINT fk_email_queue FOREIGN KEY (queue_entry_id) REFERENCES queue_entries(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(150) NOT NULL,
  auditable_type VARCHAR(100),
  auditable_id INT,
  old_values JSON,
  new_values JSON,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS performance_metrics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation VARCHAR(100) NOT NULL,
  duration_ms INT NOT NULL,
  reference_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evaluation_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_type ENUM('sus', 'tam') NOT NULL,
  respondent_role ENUM('super_admin', 'barangay_staff', 'city_staff', 'patient') NOT NULL,
  respondent_name VARCHAR(150),
  score INT NOT NULL,
  answers JSON NOT NULL,
  comments TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_evaluation_type (survey_type),
  INDEX idx_evaluation_role (respondent_role)
);
