ALTER TABLE sms_logs DROP CONSTRAINT IF EXISTS sms_logs_trigger_type_check;
ALTER TABLE sms_logs ADD CONSTRAINT sms_logs_trigger_type_check
  CHECK (trigger_type IN (
    'approval',
    'appointment_reminder',
    'missed_referral',
    'queue_call',
    'manual',
    'referral_completed',
    'referral_booked'
  ));
