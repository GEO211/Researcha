import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/authRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import healthCenterRoutes from './routes/healthCenterRoutes.js';
import userRoutes from './routes/userRoutes.js';
import patientRoutes from './routes/patientRoutes.js';
import referralRoutes from './routes/referralRoutes.js';
import queueRoutes from './routes/queueRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import smsRoutes from './routes/smsRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import patientPortalRoutes from './routes/patientPortalRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import emailRoutes from './routes/emailRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { checkDatabaseConnection, hasRemoteCredentials } from './config/db.js';

dotenv.config();

const app = express();

app.use(helmet({
  // Allow the Vite SPA and API on the same Vercel host.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(
  cors({
    origin(origin, callback) {
      const allowed = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,https://carelink-bay.vercel.app')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (!origin || allowed.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, allowed.includes(origin));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', async (_req, res) => {
  let database = 'unavailable';
  let database_error;
  try {
    const dbOk = await checkDatabaseConnection();
    database = dbOk ? 'supabase' : 'unavailable';
  } catch (error) {
    database_error = error.message || 'Database connection failed.';
    if (!hasRemoteCredentials()) {
      database_error = 'Missing SUPABASE_DB_PASSWORD or DATABASE_URL in Vercel environment variables.';
    }
  }

  res.json({
    status: 'ok',
    service: 'CareLink API',
    database,
    ...(database_error ? { database_error } : {}),
    vercel: Boolean(process.env.VERCEL),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/health-centers', healthCenterRoutes);
app.use('/api/users', userRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/sms-logs', smsRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/email-logs', emailRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/patient', patientPortalRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
