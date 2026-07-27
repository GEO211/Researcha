import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { getReferral, listSmsLogs } from '../lib/supabase/store.js';
import { sendSms } from '../services/smsService.js';
import { audit } from '../services/auditService.js';

const router = Router();

const manualSmsSchema = z.object({
  referral_id: z.coerce.number().int().positive(),
  message: z.string().min(5).max(320),
});

router.get('/', authenticate, authorize('super_admin', 'city_staff'), async (_req, res, next) => {
  try {
    const logs = await listSmsLogs();
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

router.post('/manual', authenticate, authorize('super_admin', 'city_staff'), async (req, res, next) => {
  try {
    const data = manualSmsSchema.parse(req.body);
    const referral = await getReferral(data.referral_id);

    if (!referral) {
      return res.status(404).json({ message: 'Referral not found.' });
    }

    const result = await sendSms({
      patientId: referral.patient_id,
      referralId: referral.id,
      queueEntryId: referral.queue_entry_id,
      triggerType: 'manual',
      message: data.message,
    });

    await audit(req, 'sms.manual_sent', 'referral', referral.id, null, data);
    return res.status(201).json({ result });
  } catch (error) {
    return next(error);
  }
});

export default router;
