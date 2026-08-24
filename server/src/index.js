import app from './app.js';
import { pool } from './config/db.js';
import { startReminderScheduler } from './services/reminderScheduler.js';

const port = process.env.PORT || 4000;

app.listen(port, async () => {
  console.log(`CareLink API running on http://localhost:${port}`);
  try {
    await pool.ready;
  } catch (error) {
    console.error('Supabase connection failed:', error.message);
    console.error('Set DATABASE_URL or SUPABASE_DB_PASSWORD (and pooler host) in server/.env.');
    process.exit(1);
  }
  // Cron only on long-running Node hosts — not on Vercel serverless.
  if (!process.env.VERCEL) {
    startReminderScheduler();
  }
});
