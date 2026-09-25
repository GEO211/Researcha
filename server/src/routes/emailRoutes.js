import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { listEmailLogs } from '../lib/supabase/store.js';
import { PERMISSIONS } from '../../../shared/rbac.js';

const router = Router();

router.get('/', authenticate, authorize(PERMISSIONS.EMAIL_VIEW), async (_req, res, next) => {
  try {
    const logs = await listEmailLogs();
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

export default router;
