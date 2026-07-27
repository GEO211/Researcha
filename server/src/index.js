import dotenv from 'dotenv';
import './config/db.js';
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
import auditRoutes from './routes/auditRoutes.js';
import evaluationRoutes from './routes/evaluationRoutes.js';
import emailRoutes from './routes/emailRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { checkDatabaseConnection } from './config/db.js';
import { startReminderScheduler } from './services/reminderScheduler.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(helmet());
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
  const dbOk = await checkDatabaseConnection().catch(() => false);
  res.json({ status: 'ok', service: 'CareLink API', database: dbOk ? 'supabase' : 'unavailable' });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/health-centers', healthCenterRoutes);
app.use('/api/users', userRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/sms-logs', smsRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/email-logs', emailRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/public', publicRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`CareLink API running on http://localhost:${port}`);
  startReminderScheduler();
});
