ALTER TABLE sms_logs DROP CONSTRAINT IF EXISTS sms_logs_trigger_type_check;
ALTER TABLE sms_logs ADD CONSTRAINT sms_logs_trigger_type_check
  CHECK (trigger_type IN (
    'approval',
    'appointment_reminder',
    'missed_referral',
    'queue_call',
    'manual',
    'referral_completed',
    'referral_booked',
    'referral_cancelled',
    'referral_rescheduled',
    'referral_transferred'
  ));

INSERT INTO system_settings (setting_key, setting_value, description, created_at, updated_at)
VALUES (
  'sms.completion.enabled',
  'true',
  'Send thank-you SMS when a referral visit is marked complete',
  NOW(),
  NOW()
)
ON CONFLICT (setting_key) DO UPDATE
SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  updated_at = NOW();
