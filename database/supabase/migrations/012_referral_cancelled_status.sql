-- Keep cancelled referrals distinct from archived ones so finished records can be archived later.
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE referrals ADD CONSTRAINT referrals_status_check
  CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'queued', 'completed', 'missed', 'cancelled', 'archived', 'expired'));

-- Earlier cancels were stored as archived. Put those back to cancelled when the queue was cancelled.
UPDATE referrals AS referral
SET status = 'cancelled', updated_at = NOW()
WHERE referral.status = 'archived'
  AND EXISTS (
    SELECT 1
    FROM queue_entries AS queue
    WHERE queue.referral_id = referral.id
      AND queue.queue_status = 'cancelled'
  );
