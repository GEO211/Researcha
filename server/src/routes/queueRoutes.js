import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { callQueueEntry, getPatient, getQueueEntry, getReferral, listTodayQueue } from '../lib/supabase/store.js';
import { queueCallCooldownSeconds } from '../lib/supabase/helpers.js';
import { audit } from '../services/auditService.js';
import { callEmailMessage, callEmailSubject, sendEmail } from '../services/emailService.js';
import { callMessage, resolvePatientDisplayName, sendSms } from '../services/smsService.js';

const router = Router();

router.get('/', authenticate, authorize('super_admin', 'city_staff'), async (_req, res, next) => {
  try {
    const queue = await listTodayQueue();
    res.json({ queue });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/call', authenticate, authorize('city_staff', 'super_admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const entry = await getQueueEntry(id);
    if (!entry) return res.status(404).json({ message: 'Queue entry not found.' });

    if (!['waiting', 'called'].includes(entry.queue_status)) {
      const label = String(entry.queue_status || 'unknown').replaceAll('_', ' ');
      return res.status(409).json({
        message: `Cannot call patient with queue status "${label}". Only waiting patients can be called.`,
      });
    }

    const retryAfterSeconds = queueCallCooldownSeconds(entry.called_at);
    if (retryAfterSeconds > 0) {
      return res.status(429).json({
        message: `Please wait ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'} before calling this patient again.`,
        retry_after_seconds: retryAfterSeconds,
      });
    }

    const updated = await callQueueEntry(id);
    if (!updated) {
      return res.status(409).json({ message: 'Unable to call this patient right now.' });
    }

    const patient = await getPatient(entry.patient_id);
    const referral = await getReferral(entry.referral_id);

    const patientName = resolvePatientDisplayName(patient);
    const [smsResult, emailResult] = await Promise.all([
      sendSms({
        patientId: entry.patient_id,
        referralId: entry.referral_id,
        queueEntryId: id,
        message: callMessage({
          queueNumber: entry.queue_number,
          patientName,
          trackingCode: referral?.referral_code,
        }),
        triggerType: 'queue_call',
      }),
      sendEmail({
        patientId: entry.patient_id,
        referralId: entry.referral_id,
        queueEntryId: id,
        recipientEmail: patient?.email,
        subject: callEmailSubject({ queueNumber: entry.queue_number }),
        message: callEmailMessage({ queueNumber: entry.queue_number, patientName }),
        triggerType: 'queue_call',
      }),
    ]);

    const channels = [];
    if (smsResult.status === 'sent') channels.push('SMS');
    if (emailResult.status === 'sent') channels.push('email');

    await audit(req, 'queue.called', 'queue_entry', id);
    res.json({
      id,
      queue_status: 'called',
      called_at: updated.called_at,
      sms_status: smsResult.status,
      email_status: emailResult.status,
      message: channels.length
        ? `Call notification sent via ${channels.join(' and ')}.`
        : 'Patient called. Add a phone number or email on the patient record to send notifications.',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
