import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { getAiCaseInsights } from '../lib/supabase/store.js';
import { listPhilippineDatasets } from '../../../shared/philippineDatasets.js';
import { PERMISSIONS } from '../../../shared/rbac.js';
import { getPatientDemandForecast } from '../services/forecastService.js';
import { getLatestHourlyAnalysis, listHourlyAnalyses } from '../lib/supabase/hourlyAnalysisStore.js';

const router = Router();

function aiBaseUrl() {
  const raw = (process.env.AI_API_URL || 'http://localhost:8001').trim().replace(/\/$/, '');
  if (!raw) return 'http://localhost:8001';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `https://${raw}`;
}

router.get('/health', authenticate, authorize(PERMISSIONS.DASHBOARD_AI), async (_req, res) => {
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

router.get('/datasets', authenticate, authorize(PERMISSIONS.DASHBOARD_AI), (_req, res) => {
  const datasets = listPhilippineDatasets();
  return res.json({
    geography: 'Philippines',
    focus: 'Koronadal City, South Cotabato, SOCCSKSARGEN',
    count: datasets.length,
    datasets,
  });
});

router.get('/insights', authenticate, authorize(PERMISSIONS.DASHBOARD_AI), async (req, res) => {
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

router.get('/forecast', authenticate, authorize(PERMISSIONS.DASHBOARD_AI), async (req, res, next) => {
  try {
    const forecast = await getPatientDemandForecast(req.user);
    return res.json(forecast);
  } catch (error) {
    return next(error);
  }
});

router.get('/hourly/latest', authenticate, authorize(PERMISSIONS.DASHBOARD_AI), async (_req, res, next) => {
  try {
    return res.json(await getLatestHourlyAnalysis());
  } catch (error) {
    if (error?.code === '42P01') {
      return res.json({ analysis: null, next_analysis_at: null, last_error: null });
    }
    return next(error);
  }
});

router.get('/hourly/history', authenticate, authorize(PERMISSIONS.DASHBOARD_AI), async (req, res, next) => {
  try {
    const analyses = await listHourlyAnalyses(req.query.limit);
    return res.json({ analyses });
  } catch (error) {
    if (error?.code === '42P01') return res.json({ analyses: [] });
    return next(error);
  }
});

router.post('/forecast/refresh', authenticate, authorize(PERMISSIONS.DASHBOARD_AI), async (req, res, next) => {
  try {
    const forecast = await getPatientDemandForecast(req.user, { force: true });
    return res.json(forecast);
  } catch (error) {
    return next(error);
  }
});

export default router;
