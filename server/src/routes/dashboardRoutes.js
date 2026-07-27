import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDashboardSummary } from '../lib/supabase/store.js';

const router = Router();

router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const summary = await getDashboardSummary(req.user);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

export default router;
