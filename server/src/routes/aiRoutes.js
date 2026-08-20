import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { getAiCaseInsights } from '../lib/supabase/store.js';

const router = Router();

function aiBaseUrl() {
  const raw = (process.env.AI_API_URL || 'http://localhost:8001').trim().replace(/\/$/, '');
  if (!raw) return 'http://localhost:8001';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `https://${raw}`;
}

router.get('/health', authenticate, authorize('super_admin', 'city_staff', 'barangay_staff'), async (_req, res) => {
  try {
    const response = await fetch(`${aiBaseUrl()}/health`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.json({
        status: 'ok',
        service: 'CareLink AI Insights',
        runtime: 'supabase-postgres',
        data_source: 'database',
        python: 'unavailable',
      });
    }
    return res.json({
      ...data,
      data_source: 'database',
      runtime: data.runtime || 'python-3.14.3',
    });
  } catch {
    return res.json({
      status: 'ok',
      service: 'CareLink AI Insights',
      runtime: 'supabase-postgres',
      data_source: 'database',
      python: 'offline',
    });
  }
});

router.get('/insights', authenticate, authorize('super_admin', 'city_staff', 'barangay_staff'), async (req, res) => {
  const rawDays = req.query.days;
  // Default days=0 → analyze ALL referral rows in the database.
  const days = rawDays === undefined || rawDays === '' || rawDays === 'all'
    ? 0
    : Number(rawDays);
  const overloadZ = Number(req.query.overload_z || 1);

  try {
    // Always compute from CareLink's Supabase Postgres so charts match live DB records.
    const insights = await getAiCaseInsights({
      days: Number.isFinite(days) ? days : 0,
      overloadZ: Number.isFinite(overloadZ) ? overloadZ : 1,
    });
    return res.json(insights);
  } catch (error) {
    return res.status(503).json({
      message: 'Unable to generate AI insights from the database.',
      detail: error.message,
    });
  }
});

export default router;
