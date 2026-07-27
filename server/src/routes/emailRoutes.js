import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { listEmailLogs } from '../lib/supabase/store.js';

const router = Router();

router.get('/', authenticate, authorize('super_admin', 'city_staff'), async (_req, res, next) => {
  try {
    const logs = await listEmailLogs();
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

export default router;
