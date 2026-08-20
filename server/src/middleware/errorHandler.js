import { ZodError } from 'zod';

export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation failed.',
      issues: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  if (error.code === 'already-exists' || error.code === 6) {
    return res.status(409).json({ message: 'A record with the same unique value already exists.' });
  }

  if (error.code === 'not-found' || error.code === 5) {
    return res.status(404).json({ message: 'Referenced record does not exist.' });
  }

  if (error.code === '28P01' || error.code === '28000') {
    return res.status(503).json({
      message: 'Database authentication failed. Set a real DATABASE_URL or SUPABASE_DB_PASSWORD in server/.env.',
    });
  }

  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code)) {
    return res.status(503).json({ message: 'Database is unavailable. Check the PostgreSQL connection in server/.env.' });
  }

  const status = error.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  return res.status(status).json({
    message: status === 500 ? 'Unexpected server error.' : error.message,
    details: isProduction ? undefined : error.stack,
  });
}
