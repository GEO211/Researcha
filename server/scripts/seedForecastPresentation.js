/**
 * Insert 50 days of presentation demand history so the AI forecast can run.
 *
 * Usage:
 *   node scripts/seedForecastPresentation.js
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/db.js';
import { calculateQueuePriority } from '../../shared/queuePriority.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const HISTORY_DAYS = 50;
const DEMO_TAG = 'FORECAST-DEMO';
const FIRST_NAMES = [
  'Ana', 'Juan', 'Maria', 'Jose', 'Rosa', 'Pedro', 'Liza', 'Carlo', 'Grace', 'Mark',
  'Elena', 'Ramon', 'Sofia', 'Miguel', 'Clara', 'Andres', 'Nina', 'Paolo', 'Irene', 'Luis',
  'Diana', 'Marco', 'Helen', 'Rico', 'Joyce', 'Allen', 'Faith', 'Noel', 'Karen', 'Dennis',
];
const CLINIC_REASONS = [
  'Hypertension follow-up and blood pressure monitoring',
  'Diabetes mellitus checkup and medication refill',
  'Prenatal consultation and maternal wellness visit',
  'Pediatric fever and respiratory symptom evaluation',
  'Senior wellness checkup and chronic care review',
  'Wound care and dressing change at city clinic',
  'TB symptomatic screening and sputum follow-up',
  'Asthma exacerbation follow-up and inhaler review',
  'Laboratory result interpretation and treatment plan',
  'Family planning counseling and method refill',
];

function manilaTodayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function manilaDateTime(daysBack, hour, minute) {
  const [year, month, day] = manilaTodayKey().split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - daysBack, hour - 8, minute, 0));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function pick(list, index) {
  return list[index % list.length];
}

function letterName(index) {
  let value = Number(index);
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label || 'A';
}

function arrivalsForDay(daysBack, weekday) {
  if (daysBack === 0) return 7;
  if (weekday === 0) return 4 + (daysBack % 2);
  if (weekday === 6) return 6 + (daysBack % 3);
  return 10 + ((daysBack * 3) % 7);
}

function hourForIndex(index, weekday) {
  const peak = [8, 9, 10, 11, 13, 14, 15];
  const light = [7, 16, 17];
  if (weekday === 0) return pick([8, 9, 10], index);
  return index % 4 === 0 ? pick(light, index) : pick(peak, index);
}

async function main() {
  const existing = await pool.query(
    `SELECT COUNT(*)::int AS count FROM patients WHERE last_name LIKE 'Presdemo%'`,
  );
  if (existing.rows[0].count > 0) {
    console.log(`Presentation patients already exist (${existing.rows[0].count}). Skipping insert.`);
    await pool.end();
    return;
  }

  const centers = await pool.query(
    `SELECT id, name, type FROM health_centers WHERE status = 'active' ORDER BY id`,
  );
  const barangayIds = centers.rows.filter((row) => row.type === 'barangay').map((row) => row.id);
  const cityId = centers.rows.find((row) => row.type === 'city')?.id || centers.rows[0]?.id;
  const users = await pool.query(`SELECT id, role FROM users WHERE status = 'active' ORDER BY id`);
  const barangayUserId = users.rows.find((row) => row.role === 'barangay_staff')?.id || users.rows[0]?.id;
  const cityUserId = users.rows.find((row) => row.role === 'city_staff')?.id || users.rows.at(-1)?.id;

  if (!cityId || !barangayIds.length || !barangayUserId) {
    throw new Error('Need an active city center, barangay centers, and a staff user before seeding.');
  }

  const patients = [];
  let arrivalIndex = 0;
  const referralRows = [];

  for (let daysBack = HISTORY_DAYS; daysBack >= 0; daysBack -= 1) {
    const sample = manilaDateTime(daysBack, 8, 0);
    const weekday = new Date(`${isoDate(sample)}T00:00:00.000Z`).getUTCDay();
    const arrivals = arrivalsForDay(daysBack, weekday);

    for (let slot = 0; slot < arrivals; slot += 1) {
      arrivalIndex += 1;
      const first = pick(FIRST_NAMES, arrivalIndex);
      const age = 1 + ((arrivalIndex * 7) % 82);
      const sex = arrivalIndex % 2 === 0 ? 'female' : 'male';
      const isInfant = age < 2;
      const isChild = age >= 2 && age < 18;
      const isSenior = age >= 60;
      const isPregnant = sex === 'female' && age >= 18 && age <= 42 && arrivalIndex % 9 === 0;
      const isPwd = arrivalIndex % 13 === 0;
      const isIndigenous = arrivalIndex % 19 === 0;
      const isSoloParent = arrivalIndex % 17 === 0;
      const barangayId = pick(barangayIds, arrivalIndex);
      const createdAt = manilaDateTime(daysBack, hourForIndex(slot, weekday), (arrivalIndex * 7) % 50);
      const severity = arrivalIndex % 17 === 0
        ? 'critical'
        : arrivalIndex % 7 === 0
          ? 'high'
          : arrivalIndex % 3 === 0
            ? 'low'
            : 'moderate';
      const status = daysBack === 0 && slot < 4 ? 'queued' : 'completed';
      const patient = {
        first,
        last: `Presdemo ${letterName(arrivalIndex)}`,
        age,
        sex,
        isInfant,
        isChild,
        isSenior,
        isPregnant,
        isPwd,
        isIndigenous,
        isSoloParent,
        barangayId,
      };
      patients.push(patient);

      const priority = calculateQueuePriority({
        severity,
        patient: {
          is_infant: isInfant,
          is_child: isChild,
          is_senior: isSenior,
          is_pregnant: isPregnant,
          is_pwd: isPwd,
          is_indigenous: isIndigenous,
          is_solo_parent: isSoloParent,
        },
      });

      referralRows.push({
        patient,
        createdAt,
        severity,
        status,
        priority,
        appointmentAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
        reason: pick(CLINIC_REASONS, arrivalIndex),
        urgency: severity === 'critical' ? 'emergency' : severity === 'high' ? 'urgent' : 'routine',
        type: severity === 'critical' ? 'emergency' : arrivalIndex % 5 === 0 ? 'follow_up' : 'routine',
      });
    }
  }

  console.log(`Seeding ${patients.length} presentation patients and referrals across ${HISTORY_DAYS + 1} days...`);

  const insertedPatients = [];
  const batchSize = 80;
  for (let start = 0; start < patients.length; start += batchSize) {
    const batch = patients.slice(start, start + batchSize);
    const values = [];
    const params = [];
    batch.forEach((patient, index) => {
      const o = params.length;
      values.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10},$${o + 11},$${o + 12},$${o + 13},$${o + 14},$${o + 15},$${o + 16},$${o + 17},$${o + 18})`);
      const birth = manilaDateTime(365 * patient.age + (index % 200), 8, 0);
      params.push(
        patient.barangayId,
        patient.first,
        'Demo',
        patient.last,
        isoDate(birth),
        patient.sex,
        `0918${String(7000000 + start + index).slice(-7)}`,
        `${DEMO_TAG} Purok ${1 + ((start + index) % 7)}`,
        'Koronadal City',
        '9506',
        'South Cotabato',
        patient.isSenior,
        patient.isPregnant,
        patient.isPwd,
        patient.isChild,
        patient.isInfant,
        patient.isIndigenous,
        patient.isSoloParent,
      );
    });

    const result = await pool.query(
      `INSERT INTO patients (
         health_center_id, first_name, middle_name, last_name, birth_date, sex,
         contact_number, address, city, postal_code, province,
         is_senior, is_pregnant, is_pwd, is_child, is_infant, is_indigenous, is_solo_parent
       ) VALUES ${values.join(',')}
       RETURNING id, health_center_id`,
      params,
    );
    insertedPatients.push(...result.rows);
    console.log(`  patients ${insertedPatients.length}/${patients.length}`);
  }

  const queueDayCounters = new Map();
  for (let start = 0; start < referralRows.length; start += batchSize) {
    const batch = referralRows.slice(start, start + batchSize);
    const values = [];
    const params = [];
    batch.forEach((row, index) => {
      const patient = insertedPatients[start + index];
      const o = params.length;
      const created = row.createdAt.toISOString();
      values.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10},$${o + 11},$${o + 12},$${o + 13},$${o + 14},$${o + 15},$${o + 16})`);
      params.push(
        `CL-${isoDate(row.createdAt).replaceAll('-', '')}-P${String(start + index + 1).padStart(4, '0')}`,
        patient.id,
        patient.health_center_id,
        cityId,
        barangayUserId,
        cityUserId,
        row.reason,
        row.urgency,
        row.type,
        row.severity,
        row.status,
        row.status === 'queued' ? null : row.appointmentAt.toISOString(),
        created,
        row.status === 'completed' ? row.appointmentAt.toISOString() : null,
        created,
        created,
      );
    });

    const insertedReferrals = await pool.query(
      `INSERT INTO referrals (
         referral_code, patient_id, referring_health_center_id, receiving_health_center_id,
         submitted_by_user_id, reviewed_by_user_id, referral_reason, clinical_urgency,
         referral_type, severity_level, status, appointment_at, reviewed_at, completed_at,
         created_at, updated_at
       ) VALUES ${values.join(',')}
       RETURNING id, patient_id, status, created_at, appointment_at`,
      params,
    );

    const queueValues = [];
    const queueParams = [];
    insertedReferrals.rows.forEach((referral, index) => {
      const source = batch[index];
      const queueDate = isoDate(new Date(referral.created_at));
      const key = `${queueDate}:${source.priority.legacyPriorityLevel}`;
      const next = (queueDayCounters.get(key) || 0) + 1;
      queueDayCounters.set(key, next);
      const served = referral.status === 'completed';
      const calledAt = served ? new Date(new Date(referral.created_at).getTime() + 35 * 60 * 1000) : null;
      const servedAt = served ? new Date(calledAt.getTime() + (12 + ((start + index) % 14)) * 60 * 1000) : null;
      const prefix = source.priority.legacyPriorityLevel === 'priority_1_emergency'
        ? 'E'
        : source.priority.legacyPriorityLevel === 'priority_2_vulnerable'
          ? 'V'
          : 'S';
      const o = queueParams.length;
      queueValues.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10},$${o + 11},$${o + 12},$${o + 13},$${o + 14},$${o + 15},$${o + 16},$${o + 17},$${o + 18})`);
      queueParams.push(
        referral.id,
        referral.patient_id,
        `${prefix}-${String(next).padStart(3, '0')}`,
        source.priority.legacyPriorityLevel,
        source.priority.score,
        source.priority.priorityLevel,
        source.priority.severityRank,
        source.priority.severityScore,
        source.priority.vulnerabilityScore,
        source.priority.vulnerabilityCount,
        JSON.stringify(source.priority.reasons || []),
        served ? 'served' : 'waiting',
        queueDate,
        calledAt?.toISOString() || null,
        servedAt?.toISOString() || null,
        null,
        referral.created_at,
        referral.created_at,
      );
    });

    await pool.query(
      `INSERT INTO queue_entries (
         referral_id, patient_id, queue_number, priority_level, priority_score,
         priority_band, severity_rank, severity_score, vulnerability_score,
         vulnerability_count, priority_reasons, queue_status, queue_date,
         called_at, served_at, missed_at, created_at, updated_at
       ) VALUES ${queueValues.join(',')}`,
      queueParams,
    );
    console.log(`  referrals ${Math.min(start + batch.length, referralRows.length)}/${referralRows.length}`);
  }

  const totals = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM patients WHERE last_name LIKE 'Presdemo%') AS demo_patients,
      (SELECT COUNT(*)::int FROM referrals WHERE referral_code LIKE 'CL-%-P%') AS demo_referrals,
      (SELECT COUNT(*)::int FROM referrals) AS referrals,
      (SELECT MIN((created_at AT TIME ZONE 'Asia/Manila')::date) FROM referrals) AS first_date,
      (SELECT MAX((created_at AT TIME ZONE 'Asia/Manila')::date) FROM referrals) AS last_date
  `);
  console.log('Presentation demand seed completed.', totals.rows[0]);
  await pool.end();
}

main().catch(async (error) => {
  console.error('Presentation seed failed:', error.message);
  console.error(error.stack);
  await pool.end().catch(() => {});
  process.exit(1);
});
