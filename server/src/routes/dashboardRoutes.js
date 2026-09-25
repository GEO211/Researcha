import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { getDashboardSummary } from '../lib/supabase/store.js';
import { PERMISSIONS } from '../../../shared/rbac.js';

const router = Router();

router.get('/summary', authenticate, authorize(PERMISSIONS.DASHBOARD_VIEW), async (req, res, next) => {
  try {
    const summary = await getDashboardSummary(req.user);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

export default router;
