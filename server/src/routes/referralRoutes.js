import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  approveReferralWithQueue,
  cancelReferral,
  completeReferral,
  countTodayQueueEntries,
  createReferralWithQueue,
  getHealthCenter,
  getPatient,
  getReferral,
  hasSentSms,
  listHealthCenters,
  listReferrals,
  missReferral,
  transferReferralLocation,
  updateReferral,
  updateQueueByReferral,
} from '../lib/supabase/store.js';
import { generateDefaultAppointmentAt } from '../lib/supabase/helpers.js';
import { audit } from '../services/auditService.js';
import { createQueueNumber, createReferralCode } from '../services/codeService.js';
import { calculatePriority } from '../services/priorityService.js';
import { approvalMessage, cancellationMessage, completionThankYouMessage, confirmationMessagePair, missedMessage, rejectionMessage, rescheduleMessage, resolvePatientDisplayName, sendSms } from '../services/smsService.js';
import { recordMetric, startTimer } from '../services/performanceService.js';
import { PERMISSIONS } from '../../../shared/rbac.js';

const router = Router();

const referralSchema = z.object({
  patient_id: z.coerce.number().int().positive({ message: 'Select a patient.' }),
  receiving_health_center_id: z.coerce.number().int().positive({ message: 'Select a checkup location.' }).optional(),
  referral_reason: z.string().trim().min(5, 'Referral reason must be at least 5 characters.'),
  clinical_urgency: z.enum(['emergency', 'urgent', 'routine'], { message: 'Select a clinical urgency.' }),
  referral_type: z.enum(['emergency', 'specialist_consultation', 'follow_up', 'routine'], { message: 'Select a referral type.' }),
  severity_level: z.enum(['low', 'moderate', 'high', 'critical'], { message: 'Select a severity level.' }).default('moderate'),
});

const reviewSchema = z.object({
  appointment_at: z.string().optional().nullable(),
});

const rejectSchema = z.object({
  rejection_reason: z.string().min(3),
});

const appointmentSchema = z.object({
  appointment_at: z.string().min(1),
});

function buildFilters(req) {
  const filters = {};
  if (req.user.role === 'barangay_staff') filters.healthCenterId = req.user.health_center_id;
  if (req.query.status) filters.status = req.query.status;
  if (req.query.priority_level) filters.priorityLevel = req.query.priority_level;
  if (req.query.q) filters.q = req.query.q;
  return filters;
}

function referralActionError(res, referral, action) {
  if (!referral) {
    return res.status(404).json({ message: 'Referral not found.' });
  }
  if (referral.status !== 'queued') {
    const label = String(referral.status || 'unknown').replaceAll('_', ' ');
    return res.status(409).json({
      message: `Cannot ${action} referral with status "${label}". Only queued referrals support this action.`,
    });
  }
  return null;
}

router.get('/', authenticate, authorize(PERMISSIONS.REFERRALS_VIEW, PERMISSIONS.TRACKING_OWN), async (req, res, next) => {
  try {
    let referrals = await listReferrals(buildFilters(req));
    if (req.user.role === 'patient') {
      referrals = referrals.filter((row) => Number(row.patient_id) === Number(req.user.patient_id));
    }
    res.json({ referrals });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize(PERMISSIONS.REFERRALS_CREATE), async (req, res, next) => {
  const startedAt = startTimer();

  try {
    const data = referralSchema.parse(req.body);
    const patient = await getPatient(data.patient_id);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found.' });
    }

    if (req.user.role === 'barangay_staff' && patient.health_center_id !== req.user.health_center_id) {
      return res.status(403).json({ message: 'Patient belongs to another health center.' });
    }

    if (!patient.contact_number) {
      return res.status(400).json({ message: 'Patient contact number is required to send SMS confirmation.' });
    }

    const receivingId = data.receiving_health_center_id || patient.health_center_id;
    const receivingCenter = await getHealthCenter(receivingId);
    if (!receivingCenter || receivingCenter.status !== 'active') {
      return res.status(400).json({ message: 'Select an active checkup location (barangay or city health center).' });
    }

    const appointmentAt = generateDefaultAppointmentAt();
    const payload = {
      ...data,
      receiving_health_center_id: receivingCenter.id,
      referral_code: createReferralCode(),
      referring_health_center_id: patient.health_center_id,
      submitted_by_user_id: req.user.id,
    };

    const priorityStartedAt = startTimer();
    const { priorityScore, priorityLevel } = await calculatePriority({ patient, referral: payload });
    await recordMetric('priority_score_computation', priorityStartedAt, null);

    const count = await countTodayQueueEntries();
    const queueNumber = createQueueNumber(priorityLevel, count);

    const outcome = await createReferralWithQueue({
      payload,
      patientId: payload.patient_id,
      priorityLevel,
      priorityScore,
      queueNumber,
      userId: req.user.id,
      appointmentAt,
    });

    const smsStartedAt = startTimer();
    const bookingSms = await confirmationMessagePair({
      queueNumber: outcome.queueNumber,
      trackingCode: payload.referral_code,
      patientId: payload.patient_id,
    });
    const smsResult = await sendSms({
      patientId: payload.patient_id,
      referralId: outcome.referralId,
      queueEntryId: outcome.queueEntryId,
      triggerType: 'referral_booked',
      message: bookingSms.message,
      fallbackMessage: bookingSms.fallbackMessage,
    });
    await recordMetric('sms_trigger_latency', smsStartedAt, outcome.referralId);
    await recordMetric('queue_assignment', startedAt, outcome.referralId);
    await recordMetric('referral_submission', startedAt, outcome.referralId);

    await audit(req, 'referral.submitted', 'referral', outcome.referralId, null, {
      ...payload,
      queue_number: outcome.queueNumber,
      priority_level: priorityLevel,
      appointment_at: appointmentAt,
    });

    return res.status(201).json({
      id: outcome.referralId,
      ...payload,
      tracking_code: payload.referral_code,
      status: 'queued',
      queue_number: outcome.queueNumber,
      priority_level: priorityLevel,
      priority_score: priorityScore,
      appointment_at: appointmentAt,
      sms_status: smsResult.status,
      sms_error: smsResult.error || smsResult.reason || null,
      sms_warning: smsResult.warning || null,
      sms_recipient: smsResult.recipient || patient.contact_number,
    });
  } catch (error) {
    return next(error);
  }
});

const transferSchema = z.object({
  receiving_health_center_id: z.coerce.number().int().positive(),
});

router.post('/:id/transfer', authenticate, authorize(PERMISSIONS.REFERRALS_TRANSFER), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = transferSchema.parse(req.body);
    const referral = await getReferral(id);

    if (!referral) {
      return res.status(404).json({ message: 'Referral not found.' });
    }

    if (!['queued', 'submitted', 'under_review', 'approved'].includes(referral.status)) {
      return res.status(409).json({ message: 'Only active checkups can be transferred to another health center.' });
    }

    if (req.user.role === 'barangay_staff') {
      const allowed = Number(referral.referring_health_center_id) === Number(req.user.health_center_id)
        || Number(referral.receiving_health_center_id) === Number(req.user.health_center_id);
      if (!allowed) {
        return res.status(403).json({ message: 'This checkup is not assigned to your barangay health center.' });
      }
    }

    const receivingCenter = await getHealthCenter(data.receiving_health_center_id);
    if (!receivingCenter || receivingCenter.status !== 'active') {
      return res.status(400).json({ message: 'Select an active barangay or city health center.' });
    }

    const updated = await transferReferralLocation(id, receivingCenter.id);
    await audit(req, 'referral.transferred', 'referral', id, {
      from_center_id: referral.receiving_health_center_id,
      to_center_id: receivingCenter.id,
    });

    return res.json({
      ...updated,
      message: `Checkup transferred to ${receivingCenter.name}.`,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/review', authenticate, authorize(PERMISSIONS.REFERRALS_REVIEW), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const referral = await getReferral(id);

    if (!referral) {
      return res.status(404).json({ message: 'Referral not found.' });
    }

    if (referral.status !== 'submitted') {
      return res.status(409).json({ message: 'Only submitted referrals can be moved to review.' });
    }

    await updateReferral(id, { status: 'under_review' });
    await audit(req, 'referral.under_review', 'referral', id);
    return res.json({ id, status: 'under_review' });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/approve', authenticate, authorize(PERMISSIONS.REFERRALS_REVIEW), async (req, res, next) => {
  const startedAt = startTimer();

  try {
    const id = Number(req.params.id);
    const data = reviewSchema.parse(req.body);
    const referral = await getReferral(id);

    if (!referral) {
      return res.status(404).json({ message: 'Referral not found.' });
    }

    if (!['submitted', 'under_review'].includes(referral.status)) {
      return res.status(409).json({ message: 'Referral cannot be approved from its current status.' });
    }

    const patient = await getPatient(referral.patient_id);
    const priorityStartedAt = startTimer();
    const { priorityScore, priorityLevel } = await calculatePriority({ patient, referral });
    await recordMetric('priority_score_computation', priorityStartedAt, id);

    const count = await countTodayQueueEntries();
    const queueNumber = createQueueNumber(priorityLevel, count);

    const outcome = await approveReferralWithQueue({
      id,
      userId: req.user.id,
      appointmentAt: data.appointment_at || null,
      priorityLevel,
      priorityScore,
      queueNumber,
    });

    const receivingCenter = await getHealthCenter(referral.receiving_health_center_id);
    await audit(req, 'referral.approved', 'referral', id, null, outcome);

    const alreadyBooked = await hasSentSms(id, 'referral_booked') || await hasSentSms(id, 'approval');
    if (!alreadyBooked) {
      const smsStartedAt = startTimer();
      await sendSms({
        patientId: outcome.referral.patient_id,
        referralId: id,
        queueEntryId: outcome.queueEntryId,
        triggerType: 'approval',
        message: approvalMessage({
          queueNumber: outcome.queueNumber,
          trackingCode: referral.referral_code,
          patient: patient,
        }),
      });
      await recordMetric('sms_trigger_latency', smsStartedAt, id);
    }
    await recordMetric('queue_assignment', startedAt, id);
    await recordMetric('referral_approval', startedAt, id);

    res.json({
      id,
      status: 'queued',
      queue_number: outcome.queueNumber,
      priority_level: outcome.priorityLevel,
      priority_score: outcome.priorityScore,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reject', authenticate, authorize(PERMISSIONS.REFERRALS_REVIEW), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = rejectSchema.parse(req.body);
    const referral = await getReferral(id);

    if (!referral || !['submitted', 'under_review'].includes(referral.status)) {
      return res.status(404).json({ message: 'Referral not found or cannot be rejected.' });
    }

    await updateReferral(id, {
      status: 'rejected',
      rejection_reason: data.rejection_reason,
      reviewed_by_user_id: req.user.id,
      reviewed_at: new Date().toISOString(),
    });

    await audit(req, 'referral.rejected', 'referral', id, null, data);
    await sendSms({
      patientId: referral.patient_id,
      referralId: id,
      triggerType: 'manual',
      message: rejectionMessage({
        reason: data.rejection_reason,
        trackingCode: referral.referral_code,
        queueNumber: referral.queue_number,
        patientName: resolvePatientDisplayName(referral),
      }),
    });

    return res.json({ id, status: 'rejected', ...data });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/complete', authenticate, authorize(PERMISSIONS.REFERRALS_REVIEW), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const referral = await getReferral(id);
    if (!referral) return res.status(404).json({ message: 'Referral not found.' });
    if (referral.status === 'completed') {
      return res.json({ id, status: 'completed' });
    }

    const actionError = referralActionError(res, referral, 'complete');
    if (actionError) return actionError;

    const ok = await completeReferral(id);
    if (!ok) return res.status(404).json({ message: 'Referral not found.' });

    const smsResult = await sendSms({
      patientId: referral.patient_id,
      referralId: id,
      queueEntryId: referral.queue_entry_id,
      triggerType: 'referral_completed',
      message: completionThankYouMessage({
        trackingCode: referral.referral_code || referral.tracking_code,
        queueNumber: referral.queue_number,
        patientName: resolvePatientDisplayName(referral),
      }),
    });

    await audit(req, 'referral.completed', 'referral', id);
    res.json({
      id,
      status: 'completed',
      sms_status: smsResult.status,
      sms_error: smsResult.error || smsResult.reason || null,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/miss', authenticate, authorize(PERMISSIONS.REFERRALS_REVIEW), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const referral = await missReferral(id);

    if (!referral) {
      return res.status(404).json({ message: 'Referral or queue entry not found.' });
    }

    await audit(req, 'referral.missed', 'referral', id);
    await sendSms({
      patientId: referral.patient_id,
      referralId: id,
      queueEntryId: referral.queue_entry_id,
      triggerType: 'missed_referral',
      message: missedMessage({
        appointmentAt: referral.appointment_at,
        trackingCode: referral.referral_code,
        queueNumber: referral.queue_number,
        patientName: resolvePatientDisplayName(referral),
      }),
    });

    return res.json({ id, status: 'missed' });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/cancel', authenticate, authorize(PERMISSIONS.REFERRALS_REVIEW), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const referral = await getReferral(id);
    if (!referral) return res.status(404).json({ message: 'Referral not found.' });
    if (referral.status === 'archived') {
      return res.json({ id, status: 'archived', queue_status: 'cancelled' });
    }

    const actionError = referralActionError(res, referral, 'cancel');
    if (actionError) return actionError;

    const ok = await cancelReferral(id);
    if (!ok) return res.status(404).json({ message: 'Referral not found.' });

    const smsResult = await sendSms({
      patientId: referral.patient_id,
      referralId: id,
      queueEntryId: referral.queue_entry_id,
      triggerType: 'referral_cancelled',
      message: cancellationMessage({
        trackingCode: referral.referral_code || referral.tracking_code,
        queueNumber: referral.queue_number,
        patientName: resolvePatientDisplayName(referral),
      }),
    });

    await audit(req, 'referral.cancelled', 'referral', id);
    return res.json({
      id,
      status: 'archived',
      queue_status: 'cancelled',
      sms_status: smsResult.status,
      sms_error: smsResult.error || smsResult.reason || null,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/appointment', authenticate, authorize(PERMISSIONS.REFERRALS_REVIEW), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = appointmentSchema.parse(req.body);
    const referral = await getReferral(id);
    const actionError = referralActionError(res, referral, 'schedule an appointment for');
    if (actionError) return actionError;

    const previousAppointment = referral.appointment_at ? new Date(referral.appointment_at).getTime() : null;
    const nextAppointment = new Date(data.appointment_at).getTime();
    const isReschedule = previousAppointment && previousAppointment !== nextAppointment;

    await updateReferral(id, { appointment_at: data.appointment_at });

    let smsResult = null;
    if (isReschedule) {
      smsResult = await sendSms({
        patientId: referral.patient_id,
        referralId: id,
        queueEntryId: referral.queue_entry_id,
        triggerType: 'referral_rescheduled',
        message: rescheduleMessage({
          appointmentAt: data.appointment_at,
          trackingCode: referral.referral_code || referral.tracking_code,
          queueNumber: referral.queue_number,
          patientName: resolvePatientDisplayName(referral),
        }),
      });
    }

    await audit(req, 'referral.appointment_scheduled', 'referral', id, null, data);
    return res.json({
      id,
      appointment_at: data.appointment_at,
      sms_status: smsResult?.status || null,
      sms_error: smsResult?.error || smsResult?.reason || null,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/invalid-queue', authenticate, authorize(PERMISSIONS.REFERRALS_REVIEW), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const referral = await getReferral(id);
    if (!referral) return res.status(404).json({ message: 'Referral not found.' });
    if (referral.status === 'rejected' && referral.rejection_reason === 'Invalid queue number') {
      return res.json({ id, status: 'rejected', queue_status: 'cancelled', rejection_reason: 'Invalid queue number' });
    }

    const actionError = referralActionError(res, referral, 'mark as invalid queue');
    if (actionError) return actionError;

    await updateReferral(id, {
      status: 'rejected',
      rejection_reason: 'Invalid queue number',
      reviewed_by_user_id: req.user.id,
      reviewed_at: new Date().toISOString(),
    });
    await updateQueueByReferral(id, { queue_status: 'cancelled' });

    await audit(req, 'referral.invalid_queue_number', 'referral', id);
    return res.json({ id, status: 'rejected', queue_status: 'cancelled', rejection_reason: 'Invalid queue number' });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/archive', authenticate, authorize(PERMISSIONS.REFERRALS_REVIEW), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const referral = await getReferral(id);

    if (!referral || !['completed', 'missed', 'rejected', 'expired'].includes(referral.status)) {
      return res.status(404).json({ message: 'Referral not found or cannot be archived.' });
    }

    await updateReferral(id, { status: 'archived' });
    await audit(req, 'referral.archived', 'referral', id);
    return res.json({ id, status: 'archived' });
  } catch (error) {
    return next(error);
  }
});

export default router;
