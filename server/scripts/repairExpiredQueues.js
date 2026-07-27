import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/db.js';
import { todayDateString } from '../src/lib/supabase/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const today = todayDateString();
  console.log(`Repairing wrongly expired queue entries (app date: ${today})...`);

  const { rows } = await pool.query(
    `SELECT r.id AS referral_id, q.id AS queue_id
     FROM referrals r
     JOIN queue_entries q ON q.referral_id = r.id
     WHERE r.status = 'expired' OR q.queue_status = 'expired'`,
  );

  for (const row of rows) {
    await pool.query(
      `UPDATE referrals SET status = 'queued', updated_at = NOW() WHERE id = $1`,
      [row.referral_id],
    );
    await pool.query(
      `UPDATE queue_entries SET queue_status = 'waiting', queue_date = $1, updated_at = NOW() WHERE id = $2`,
      [today, row.queue_id],
    );
    console.log(`Repaired referral #${row.referral_id}`);
  }

  console.log(`Done. Repaired ${rows.length} referral(s).`);
  await pool.end();
}

main().catch((error) => {
  console.error('Repair failed:', error.message);
  process.exit(1);
});
