import { ZodError } from 'zod';

export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

function isDatabaseError(error) {
  if (!error) return false;
  if (['28P01', '28000', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code)) {
    return true;
  }
  const message = String(error.message || '');
  return /supabase|postgres|database|credentials missing|could not reach/i.test(message);
}

export function errorHandler(error, req, res, _next) {
  if (error instanceof ZodError) {
    const issues = Array.isArray(error.issues) ? error.issues : [];
    return res.status(400).json({
      message: 'Validation failed.',
      issues: issues.map((issue) => ({
        field: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path || ''),
        message: issue.message,
      })),
    });
  }

  if (error.code === 'already-exists' || error.code === 6 || error.code === '23505') {
    const detail = String(error.detail || error.message || '');
    if (/patients/i.test(detail) || /uq_patients_/i.test(String(error.constraint || ''))) {
      return res.status(409).json({
        message: 'This patient is already registered. A matching record was found, so a new entry was not created.',
        code: 'patient_exists',
      });
    }
    return res.status(409).json({ message: 'A record with the same unique value already exists.' });
  }

  if (error.code === 'not-found' || error.code === 5) {
    return res.status(404).json({ message: 'Referenced record does not exist.' });
  }

  if (error.code === '28P01' || error.code === '28000') {
    return res.status(503).json({
      message: 'Database authentication failed. Set SUPABASE_DB_PASSWORD (or DATABASE_URL) in Vercel env vars.',
    });
  }

  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code) || isDatabaseError(error)) {
    return res.status(503).json({
      message: error.message || 'Database is unavailable. Check Supabase env vars on Vercel and redeploy.',
    });
  }

  const status = error.status || 500;
  console.error('[CareLink API]', error);

  return res.status(status).json({
    message: status === 500 ? 'Unexpected server error.' : error.message,
    details: process.env.NODE_ENV === 'production' ? undefined : error.stack,
  });
}
