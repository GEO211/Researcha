import { pool } from '../src/config/db.js';

const { rows } = await pool.query(
  `SELECT r.referral_code, p.last_name, r.status
   FROM referrals r
   JOIN patients p ON p.id = r.patient_id
   WHERE r.status IN ('completed', 'archived')
   ORDER BY r.completed_at DESC NULLS LAST
   LIMIT 3`,
);
console.log(rows);
if (!rows[0]) {
  await pool.end();
  process.exit(0);
}

const login = await fetch('http://127.0.0.1:4000/api/auth/patient', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tracking_code: rows[0].referral_code, last_name: rows[0].last_name }),
});
const session = await login.json();
const headers = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };
const first = await fetch(`http://127.0.0.1:4000/api/patient/history/${encodeURIComponent(rows[0].referral_code)}/rating`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ rating: 5, comments: 'Smooth process and accommodating staff.' }),
});
const firstBody = await first.json();
const second = await fetch(`http://127.0.0.1:4000/api/patient/history/${encodeURIComponent(rows[0].referral_code)}/rating`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ rating: 4 }),
});
const secondBody = await second.json();
console.log({ login: login.status, first: first.status, firstBody, second: second.status, secondBody });
await pool.end();
