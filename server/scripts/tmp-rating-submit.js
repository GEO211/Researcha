import { pool } from '../src/config/db.js';

const { rows } = await pool.query(
  `SELECT r.referral_code, p.last_name, r.status, r.referral_type
   FROM referrals r
   JOIN patients p ON p.id = r.patient_id
   LEFT JOIN visit_ratings vr ON vr.referral_id = r.id
   WHERE r.status IN ('completed', 'archived')
     AND vr.id IS NULL
   ORDER BY r.completed_at DESC NULLS LAST
   LIMIT 3`,
);
console.log('unrated', rows);
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
  body: JSON.stringify({
    rating: 2,
    comments: 'Waiting time was too long.',
    categories: { staff: 4, service: 3, waiting_time: 1, cleanliness: 4, overall: 2 },
  }),
});
const firstBody = await first.json();
const second = await fetch(`http://127.0.0.1:4000/api/patient/history/${encodeURIComponent(rows[0].referral_code)}/rating`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ rating: 5 }),
});
const secondBody = await second.json();
const ratings = await fetch('http://127.0.0.1:4000/api/patient/ratings', { headers });
const ratingsBody = await ratings.json();
console.log({
  code: rows[0].referral_code,
  last_name: rows[0].last_name,
  login: login.status,
  first: first.status,
  firstBody,
  second: second.status,
  secondBody,
  awaiting: ratingsBody.awaiting?.length,
  rated: ratingsBody.rated?.length,
});
await pool.end();
