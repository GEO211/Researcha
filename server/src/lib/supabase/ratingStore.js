import { query, queryOne } from './query.js';
import { todayDateString, toDateString } from './helpers.js';
import { ensureVisitRatingsTable } from './patientPortalStore.js';
import {
  parseCategories,
  patientDisplayLabel,
  serviceLabel,
} from '../../../../shared/visitRatings.js';

const INTERNAL_STATUSES = new Set(['new', 'reviewed', 'acknowledged', 'needs_attention', 'resolved']);

function serialize(row) {
  if (!row) return null;
  const out = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (value instanceof Date) out[key] = value.toISOString();
  }
  return out;
}

function staffRatingRow(row) {
  const serialized = serialize(row);
  return {
    id: Number(serialized.id),
    referral_id: Number(serialized.referral_id),
    visit_number: serialized.referral_code,
    queue_number: serialized.queue_number || null,
    department: serialized.receiving_center_name || null,
    service: serviceLabel(serialized.referral_type),
    referral_type: serialized.referral_type || null,
    completed_at: serialized.completed_at || null,
    check_in_at: serialized.queue_created_at || serialized.referral_created_at || null,
    appointment_at: serialized.appointment_at || null,
    rating: Number(serialized.rating),
    comments: serialized.comments || '',
    categories: parseCategories(serialized.categories),
    internal_status: serialized.internal_status || 'new',
    created_at: serialized.created_at,
    reviewed_at: serialized.reviewed_at || null,
    patient_label: patientDisplayLabel(serialized.first_name, serialized.last_name),
  };
}

function addDays(isoDate, days) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateBounds(filters = {}) {
  const today = todayDateString();
  if (filters.range === 'today') return { from: today, to: today };
  if (filters.range === 'week') return { from: addDays(today, -6), to: today };
  if (filters.range === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  const from = toDateString(filters.from);
  const to = toDateString(filters.to);
  if (from || to) return { from, to };
  return {};
}

function buildRatingFilters(filters = {}) {
  const clauses = [];
  const params = [];
  const bounds = dateBounds(filters);

  if (bounds.from) {
    params.push(bounds.from);
    clauses.push(`vr.created_at::date >= $${params.length}::date`);
  }
  if (bounds.to) {
    params.push(bounds.to);
    clauses.push(`vr.created_at::date <= $${params.length}::date`);
  }
  if (filters.rating) {
    params.push(Number(filters.rating));
    clauses.push(`vr.rating = $${params.length}`);
  }
  if (filters.service) {
    params.push(String(filters.service));
    clauses.push(`r.referral_type = $${params.length}`);
  }
  if (filters.department) {
    params.push(String(filters.department));
    clauses.push(`hc_to.name = $${params.length}`);
  }
  if (filters.status && INTERNAL_STATUSES.has(filters.status)) {
    params.push(filters.status);
    clauses.push(`vr.internal_status = $${params.length}`);
  }
  if (filters.has_feedback === '1' || filters.has_feedback === true) {
    clauses.push(`vr.comments IS NOT NULL AND btrim(vr.comments) <> ''`);
  }
  if (filters.has_feedback === '0' || filters.has_feedback === false) {
    clauses.push(`(vr.comments IS NULL OR btrim(vr.comments) = '')`);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

const RATING_SELECT = `
  SELECT vr.*,
         r.referral_code,
         r.referral_type,
         r.completed_at,
         r.appointment_at,
         r.created_at AS referral_created_at,
         q.queue_number,
         q.created_at AS queue_created_at,
         hc_to.name AS receiving_center_name,
         p.first_name,
         p.last_name
  FROM visit_ratings vr
  JOIN referrals r ON r.id = vr.referral_id
  JOIN patients p ON p.id = vr.patient_id
  LEFT JOIN queue_entries q ON q.referral_id = r.id
  LEFT JOIN health_centers hc_to ON hc_to.id = r.receiving_health_center_id
`;

export async function listStaffRatings(filters = {}) {
  await ensureVisitRatingsTable();
  const { sql, params } = buildRatingFilters(filters);
  const rows = await query(
    `${RATING_SELECT}
     ${sql}
     ORDER BY vr.created_at DESC
     LIMIT 400`,
    params,
  );
  const seen = new Set();
  return rows.map(staffRatingRow).filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export async function getStaffRating(id) {
  await ensureVisitRatingsTable();
  const row = await queryOne(`${RATING_SELECT} WHERE vr.id = $1 LIMIT 1`, [Number(id)]);
  return row ? staffRatingRow(row) : null;
}

export async function updateStaffRatingStatus(id, status, userId) {
  if (!INTERNAL_STATUSES.has(status)) {
    const error = new Error('Choose a valid internal status.');
    error.status = 400;
    throw error;
  }
  await ensureVisitRatingsTable();
  const existing = await queryOne('SELECT id FROM visit_ratings WHERE id = $1', [Number(id)]);
  if (!existing) {
    const error = new Error('Rating not found.');
    error.status = 404;
    throw error;
  }
  await query(
    `UPDATE visit_ratings
     SET internal_status = $1, reviewed_at = NOW(), reviewed_by_user_id = $2
     WHERE id = $3`,
    [status, userId ? Number(userId) : null, Number(id)],
  );
  return getStaffRating(id);
}

function average(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export async function getStaffRatingSummary(filters = {}) {
  const ratings = await listStaffRatings(filters);
  const completed = await queryOne(
    `SELECT COUNT(*)::int AS count
     FROM referrals
     WHERE status IN ('completed', 'archived')`,
  );
  const scores = ratings.map((row) => Number(row.rating)).filter((value) => value >= 1);
  const byStar = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const score of scores) byStar[score] += 1;
  const total = scores.length;
  const avg = average(scores);
  const fiveStarPct = total ? Math.round((byStar[5] / total) * 100) : 0;
  const fourStarPct = total ? Math.round((byStar[4] / total) * 100) : 0;
  const lowStarPct = total ? Math.round(((byStar[1] + byStar[2]) / total) * 100) : 0;
  const needsAttention = ratings.filter((row) => row.internal_status === 'needs_attention' || row.rating <= 2).length;
  const completedCount = Number(completed?.count || 0);

  const serviceMap = new Map();
  const departmentMap = new Map();
  const dayMap = new Map();
  const categoryTotals = {
    staff: [],
    service: [],
    waiting_time: [],
    cleanliness: [],
    overall: [],
  };

  for (const row of ratings) {
    const service = row.service || 'Medical Consultation';
    if (!serviceMap.has(service)) serviceMap.set(service, []);
    serviceMap.get(service).push(row.rating);

    const department = row.department || 'Health center';
    if (!departmentMap.has(department)) departmentMap.set(department, []);
    departmentMap.get(department).push(row.rating);

    const day = String(row.created_at || '').slice(0, 10);
    if (day) dayMap.set(day, (dayMap.get(day) || 0) + 1);

    for (const key of Object.keys(categoryTotals)) {
      const score = Number(row.categories?.[key]);
      if (Number.isInteger(score) && score >= 1 && score <= 5) categoryTotals[key].push(score);
    }
  }

  const toSeries = (map) => [...map.entries()]
    .map(([label, values]) => ({
      label,
      average: average(values),
      count: values.length,
    }))
    .sort((a, b) => b.average - a.average);

  const today = todayDateString();
  const trend = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    trend.push({ label: date.slice(5), fullLabel: date, count: dayMap.get(date) || 0 });
  }

  return {
    total,
    average: avg,
    by_star: byStar,
    five_star_percent: fiveStarPct,
    four_star_percent: fourStarPct,
    low_star_percent: lowStarPct,
    needs_attention: needsAttention,
    completed_transactions: completedCount,
    rated_transactions: total,
    response_rate: completedCount ? Math.round((total / completedCount) * 100) : 0,
    by_service: toSeries(serviceMap),
    by_department: toSeries(departmentMap),
    category_averages: Object.fromEntries(
      Object.entries(categoryTotals).map(([key, values]) => [key, average(values)]),
    ),
    trend,
  };
}
