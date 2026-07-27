import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { listAuditLogs } from '../lib/supabase/store.js';

const router = Router();

router.get('/', authenticate, authorize('super_admin'), async (req, res, next) => {
  try {
    const logs = await listAuditLogs({
      action: req.query.action,
      userId: req.query.user_id ? Number(req.query.user_id) : undefined,
    });
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

export default router;
