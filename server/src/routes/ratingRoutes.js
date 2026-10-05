import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../../../shared/rbac.js';
import {
  getStaffRating,
  getStaffRatingSummary,
  listStaffRatings,
  updateStaffRatingStatus,
} from '../lib/supabase/ratingStore.js';

const router = Router();
const requireView = authorize(PERMISSIONS.RATINGS_VIEW);
const requireModerate = authorize(PERMISSIONS.RATINGS_MODERATE);

const statusSchema = z.object({
  internal_status: z.enum(['new', 'reviewed', 'acknowledged', 'needs_attention', 'resolved']),
});

router.get('/', authenticate, requireView, async (req, res, next) => {
  try {
    const ratings = await listStaffRatings(req.query);
    return res.json({ ratings });
  } catch (error) {
    return next(error);
  }
});

router.get('/summary', authenticate, requireView, async (req, res, next) => {
  try {
    const summary = await getStaffRatingSummary(req.query);
    return res.json({ summary });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', authenticate, requireView, async (req, res, next) => {
  try {
    const rating = await getStaffRating(req.params.id);
    if (!rating) return res.status(404).json({ message: 'Rating not found.' });
    return res.json({ rating });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/status', authenticate, requireModerate, async (req, res, next) => {
  try {
    const data = statusSchema.parse(req.body);
    const rating = await updateStaffRatingStatus(req.params.id, data.internal_status, req.user.id);
    return res.json({ rating });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
});

export default router;
