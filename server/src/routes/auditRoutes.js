import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { listAuditLogs } from '../lib/supabase/store.js';
import { PERMISSIONS } from '../../../shared/rbac.js';

const router = Router();

router.get('/', authenticate, authorize(PERMISSIONS.AUDIT_VIEW), async (req, res, next) => {
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
