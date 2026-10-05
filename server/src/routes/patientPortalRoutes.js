import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../../../shared/rbac.js';
import {
  createPatientVisitRating,
  getPatientPortalProfile,
  getPatientPortalQueueStatus,
  getPatientPortalVisit,
  listPatientPortalHistory,
} from '../lib/supabase/patientPortalStore.js';

const router = Router();
const requirePatient = authorize(PERMISSIONS.TRACKING_OWN);

function assertPatient(req, res) {
  if (req.user?.role !== 'patient' || !req.user.patient_id) {
    res.status(403).json({ message: 'This page is only available on the patient portal.' });
    return false;
  }
  return true;
}

const ratingSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comments: z.string().trim().max(1000).optional().nullable(),
});

router.get('/profile', authenticate, requirePatient, async (req, res, next) => {
  try {
    if (!assertPatient(req, res)) return;
    const profile = await getPatientPortalProfile(req.user);
    if (!profile) return res.status(404).json({ message: 'Patient record not found.' });
    return res.json({ profile });
  } catch (error) {
    return next(error);
  }
});

router.get('/queue-status', authenticate, requirePatient, async (req, res, next) => {
  try {
    if (!assertPatient(req, res)) return;
    const payload = await getPatientPortalQueueStatus(req.user);
    if (!payload) return res.status(404).json({ message: 'Patient record not found.' });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

router.get('/history', authenticate, requirePatient, async (req, res, next) => {
  try {
    if (!assertPatient(req, res)) return;
    const visits = await listPatientPortalHistory(req.user);
    return res.json({ visits });
  } catch (error) {
    return next(error);
  }
});

router.get('/history/:code', authenticate, requirePatient, async (req, res, next) => {
  try {
    if (!assertPatient(req, res)) return;
    const visit = await getPatientPortalVisit(req.user, req.params.code);
    if (!visit) return res.status(404).json({ message: 'Visit not found.' });
    return res.json({ visit });
  } catch (error) {
    return next(error);
  }
});

router.post('/history/:code/rating', authenticate, requirePatient, async (req, res, next) => {
  try {
    if (!assertPatient(req, res)) return;
    const data = ratingSchema.parse(req.body);
    const rating = await createPatientVisitRating(req.user, req.params.code, data);
    return res.status(201).json({ rating });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

export default router;
