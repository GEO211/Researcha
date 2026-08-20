/**
 * Seed at least 1000 realistic clinic dataset records for CareLink.
 * Inserts patients, referrals, and queue entries directly (no SMS triggers).
 *
 * Usage:
 *   node scripts/seedClinicDataset.js
 *   node scripts/seedClinicDataset.js --patients=1200 --referrals=1200
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
      return [key, value];
    }),
);

const PATIENT_TARGET = Math.max(1000, Number(args.patients) || 1000);
const REFERRAL_TARGET = Math.max(1000, Number(args.referrals) || 1000);
const BATCH_SIZE = 200;

const BARANGAYS = [
  'Zone I', 'Zone II', 'Zone III', 'Zone IV', 'Sta. Cruz', 'San Isidro',
  'General Paulino Santos', 'Mabini', 'Caloocan', 'Assumption', 'Morales',
  'San Jose', 'Concepcion', 'Rotonda', 'Paraiso', 'Namnama', 'Saravia',
  'Topland', 'Magsaysay', 'San Roque',
];

const FIRST_NAMES = [
  'Ana', 'Juan', 'Maria', 'Jose', 'Rosa', 'Pedro', 'Liza', 'Carlo', 'Grace', 'Mark',
  'Elena', 'Ramon', 'Sofia', 'Miguel', 'Clara', 'Andres', 'Nina', 'Paolo', 'Irene', 'Luis',
  'Diana', 'Marco', 'Helen', 'Rico', 'Joyce', 'Allen', 'Faith', 'Noel', 'Karen', 'Dennis',
  'Angela', 'Ben', 'Cynthia', 'Erik', 'Gina', 'Henry', 'Ivy', 'Joel', 'Kate', 'Leo',
];

const LAST_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres', 'Flores', 'Gonzales', 'Ramos',
  'Lopez', 'Diaz', 'Castillo', 'Rivera', 'Aquino', 'Navarro', 'Domingo', 'Pascual', 'Villanueva', 'Soriano',
  'Dela Cruz', 'Del Rosario', 'Magbanua', 'Alvarez', 'Fernandez', 'Salazar', 'Padilla', 'Santiago', 'Morales', 'Tan',
];

const CLINIC_REASONS = [
  'Hypertension follow-up and blood pressure monitoring',
  'Diabetes mellitus checkup and medication refill',
  'Prenatal consultation and maternal wellness visit',
  'Pediatric fever and respiratory symptom evaluation',
  'Senior wellness checkup and chronic care review',
  'Wound care and dressing change at city clinic',
  'TB symptomatic screening and sputum follow-up',
  'Immunization counseling and vaccine catch-up',
  'Dental referral for extraction and oral infection',
  'Mental health counseling and anxiety follow-up',
  'Urinary tract infection symptoms needing evaluation',
  'Asthma exacerbation follow-up and inhaler review',
  'Postpartum checkup and newborn care counseling',
  'Laboratory result interpretation and treatment plan',
  'Specialty consultation for dermatology concerns',
  'Orthopedic pain evaluation after barangay triage',
  'Eye irritation and vision screening referral',
  'Family planning counseling and method refill',
  'Malnutrition monitoring for underweight child',
  'Emergency referral for high fever and dehydration',
];

const URGENCIES = ['routine', 'routine', 'routine', 'urgent', 'urgent', 'emergency'];
const REFERRAL_TYPES = ['routine', 'routine', 'follow_up', 'follow_up', 'specialist_consultation', 'emergency'];
const SEVERITIES = ['low', 'moderate', 'moderate', 'high', 'critical'];
const STATUSES = [
  'completed', 'completed', 'completed', 'completed',
  'queued', 'queued', 'queued',
  'missed', 'archived', 'rejected', 'expired',
];

function pick(list, index) {
  return list[index % list.length];
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function daysAgo(maxDays) {
  const offset = Math.floor(Math.random() * maxDays);
  const date = new Date();
  date.setDate(date.getDate() - offset);
  date.setHours(8 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60), 0, 0);
  return date;
}

function isoDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function birthDateFromAge(ageYears) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - ageYears);
  date.setMonth(Math.floor(Math.random() * 12));
  date.setDate(1 + Math.floor(Math.random() * 27));
  return isoDateOnly(date);
}

function phoneForIndex(index) {
  const suffix = String(900000000 + index).slice(-9);
  return `09${suffix}`;
}

function referralCode(index, createdAt) {
  const stamp = isoDateOnly(createdAt).replaceAll('-', '');
  const token = String(index).padStart(5, '0');
  return `CL-${stamp}-D${token}`;
}

function queuePrefix(priorityLevel) {
  if (priorityLevel === 'priority_1_emergency') return 'E';
  if (priorityLevel === 'priority_2_vulnerable') return 'V';
  return 'S';
}

function scoreReferral({ urgency, referralType, severity, isSenior, isPregnant, isPwd }) {
  let score = 0;
  score += { emergency: 100, urgent: 60, routine: 20 }[urgency] || 20;
  score += { emergency: 50, specialist_consultation: 30, follow_up: 15, routine: 5 }[referralType] || 5;
  score += { low: 5, moderate: 15, high: 35, critical: 60 }[severity] || 15;
  if (isSenior) score += 25;
  if (isPregnant) score += 25;
  if (isPwd) score += 25;
  return score;
}

function priorityFromScore(score) {
  if (score >= 100) return 'priority_1_emergency';
  if (score >= 50) return 'priority_2_vulnerable';
  return 'priority_3_standard';
}

async function ensureBarangayCenters() {
  const existing = await pool.query('SELECT id, name FROM health_centers WHERE type = $1 ORDER BY id', ['barangay']);
  const byName = new Map(existing.rows.map((row) => [row.name, row.id]));
  const centerIds = [...byName.values()];

  for (const barangay of BARANGAYS) {
    const name = `Barangay ${barangay} Health Center`;
    if (byName.has(name)) continue;

    const inserted = await pool.query(
      `INSERT INTO health_centers (name, type, address, contact_number, status)
       VALUES ($1, 'barangay', $2, $3, 'active')
       RETURNING id, name`,
      [name, `Barangay ${barangay}, Koronadal City, South Cotabato`, phoneForIndex(barangay.length * 17)],
    );
    centerIds.push(inserted.rows[0].id);
    byName.set(name, inserted.rows[0].id);
  }

  const city = await pool.query(`SELECT id FROM health_centers WHERE type = 'city' ORDER BY id LIMIT 1`);
  const cityId = city.rows[0]?.id || 1;
  return { barangayIds: centerIds, cityId };
}

async function insertPatients(barangayIds, count) {
  let inserted = 0;

  for (let start = 0; start < count; start += BATCH_SIZE) {
    const size = Math.min(BATCH_SIZE, count - start);
    const values = [];
    const params = [];

    for (let i = 0; i < size; i += 1) {
      const index = start + i + 1;
      const first = pick(FIRST_NAMES, index);
      const last = pick(LAST_NAMES, index * 3);
      const sex = index % 2 === 0 ? 'female' : 'male';
      const age = 1 + (index % 90);
      const isSenior = age >= 60;
      const isPregnant = sex === 'female' && age >= 18 && age <= 45 && index % 11 === 0;
      const isPwd = index % 17 === 0;
      const barangayId = pick(barangayIds, index);
      const barangayName = BARANGAYS[index % BARANGAYS.length];
      const offset = params.length;

      values.push(`($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11},$${offset + 12},$${offset + 13},$${offset + 14})`);
      params.push(
        barangayId,
        first,
        index % 5 === 0 ? 'Santos' : null,
        last,
        birthDateFromAge(age),
        sex,
        phoneForIndex(index),
        `${index} Purok ${1 + (index % 7)}, Barangay ${barangayName}`,
        'Koronadal City',
        'South Cotabato',
        isSenior,
        isPregnant,
        isPwd,
        isSenior ? 'Needs chronic care follow-up' : null,
      );
    }

    const result = await pool.query(
      `INSERT INTO patients (
         health_center_id, first_name, middle_name, last_name, birth_date, sex,
         contact_number, address, city, province, is_senior, is_pregnant, is_pwd, medical_notes
       ) VALUES ${values.join(',')}
       RETURNING id, health_center_id, is_senior, is_pregnant, is_pwd, sex`,
      params,
    );

    inserted += result.rows.length;
    if (start === 0 || inserted % 400 === 0 || inserted === count) {
      console.log(`  patients: ${inserted}/${count}`);
    }

    if (start === 0) {
      // keep first batch ids for referrals path through returned rows
    }
  }

  const patients = await pool.query(
    `SELECT id, health_center_id, is_senior, is_pregnant, is_pwd, sex
     FROM patients
     ORDER BY id DESC
     LIMIT $1`,
    [count],
  );

  return patients.rows.reverse();
}

async function insertReferralsAndQueues(patients, cityId, count) {
  let inserted = 0;
  let queueDayCounters = new Map();

  for (let start = 0; start < count; start += BATCH_SIZE) {
    const size = Math.min(BATCH_SIZE, count - start);
    const referralRows = [];

    for (let i = 0; i < size; i += 1) {
      const index = start + i + 1;
      const patient = patients[index % patients.length];
      const createdAt = daysAgo(180);
      const urgency = randomItem(URGENCIES);
      const referralType = urgency === 'emergency' ? 'emergency' : randomItem(REFERRAL_TYPES);
      const severity = urgency === 'emergency' ? randomItem(['high', 'critical']) : randomItem(SEVERITIES);
      const status = randomItem(STATUSES);
      const score = scoreReferral({
        urgency,
        referralType,
        severity,
        isSenior: patient.is_senior,
        isPregnant: patient.is_pregnant,
        isPwd: patient.is_pwd,
      });
      const priorityLevel = priorityFromScore(score);
      const appointmentAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
      const reviewedAt = ['rejected', 'queued', 'completed', 'missed', 'archived', 'expired'].includes(status)
        ? new Date(createdAt.getTime() + 2 * 60 * 60 * 1000)
        : null;
      const completedAt = status === 'completed'
        ? new Date(appointmentAt.getTime() + 2 * 60 * 60 * 1000)
        : null;

      referralRows.push({
        referral_code: referralCode(index, createdAt),
        patient_id: patient.id,
        referring_health_center_id: patient.health_center_id,
        receiving_health_center_id: cityId,
        submitted_by_user_id: 2,
        reviewed_by_user_id: ['rejected', 'queued', 'completed', 'missed', 'archived', 'expired'].includes(status) ? 3 : null,
        referral_reason: randomItem(CLINIC_REASONS),
        clinical_urgency: urgency,
        referral_type: referralType,
        severity_level: severity,
        status,
        rejection_reason: status === 'rejected' ? 'Insufficient clinical details for intake' : null,
        appointment_at: ['queued', 'completed', 'missed', 'archived', 'expired'].includes(status) ? appointmentAt.toISOString() : null,
        reviewed_at: reviewedAt?.toISOString() || null,
        completed_at: completedAt?.toISOString() || null,
        created_at: createdAt.toISOString(),
        priority_level: priorityLevel,
        priority_score: score,
      });
    }

    // Rebuild cleanly to avoid placeholder bug
    const cleanValues = [];
    const cleanParams = [];
    for (const row of referralRows) {
      const o = cleanParams.length;
      cleanValues.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10},$${o + 11},$${o + 12},$${o + 13},$${o + 14},$${o + 15},$${o + 16},$${o + 17})`);
      cleanParams.push(
        row.referral_code,
        row.patient_id,
        row.referring_health_center_id,
        row.receiving_health_center_id,
        row.submitted_by_user_id,
        row.reviewed_by_user_id,
        row.referral_reason,
        row.clinical_urgency,
        row.referral_type,
        row.severity_level,
        row.status,
        row.rejection_reason,
        row.appointment_at,
        row.reviewed_at,
        row.completed_at,
        row.created_at,
        row.created_at,
      );
    }

    const insertedReferrals = await pool.query(
      `INSERT INTO referrals (
         referral_code, patient_id, referring_health_center_id, receiving_health_center_id,
         submitted_by_user_id, reviewed_by_user_id, referral_reason, clinical_urgency,
         referral_type, severity_level, status, rejection_reason, appointment_at,
         reviewed_at, completed_at, created_at, updated_at
       ) VALUES ${cleanValues.join(',')}
       RETURNING id, patient_id, status, created_at, appointment_at`,
      cleanParams,
    );

    const queueValues = [];
    const queueParams = [];
    insertedReferrals.rows.forEach((referral, idx) => {
      const source = referralRows[idx];
      if (!['queued', 'completed', 'missed', 'archived', 'expired'].includes(referral.status)) return;

      const queueDate = isoDateOnly(new Date(referral.created_at));
      const key = `${queueDate}:${source.priority_level}`;
      const next = (queueDayCounters.get(key) || 0) + 1;
      queueDayCounters.set(key, next);

      const queueStatus = {
        queued: 'waiting',
        completed: 'served',
        missed: 'missed',
        archived: 'cancelled',
        expired: 'expired',
      }[referral.status];

      const o = queueParams.length;
      queueValues.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10},$${o + 11},$${o + 12})`);
      queueParams.push(
        referral.id,
        referral.patient_id,
        `${queuePrefix(source.priority_level)}-${String(next).padStart(3, '0')}`,
        source.priority_level,
        source.priority_score,
        queueStatus,
        queueDate,
        queueStatus === 'served' || queueStatus === 'missed' ? referral.appointment_at : null,
        queueStatus === 'served' ? referral.appointment_at : null,
        queueStatus === 'missed' ? referral.appointment_at : null,
        referral.created_at,
        referral.created_at,
      );
    });

    if (queueValues.length) {
      await pool.query(
        `INSERT INTO queue_entries (
           referral_id, patient_id, queue_number, priority_level, priority_score,
           queue_status, queue_date, called_at, served_at, missed_at, created_at, updated_at
         ) VALUES ${queueValues.join(',')}`,
        queueParams,
      );
    }

    inserted += insertedReferrals.rows.length;
    console.log(`  referrals: ${inserted}/${count}`);
  }

  return inserted;
}

async function main() {
  console.log(`Seeding clinic dataset (patients=${PATIENT_TARGET}, referrals=${REFERRAL_TARGET})...`);

  const { barangayIds, cityId } = await ensureBarangayCenters();
  console.log(`Using ${barangayIds.length} barangay centers + city center ${cityId}`);

  const patients = await insertPatients(barangayIds, PATIENT_TARGET);
  const referrals = await insertReferralsAndQueues(patients, cityId, REFERRAL_TARGET);

  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM patients) AS patients,
      (SELECT COUNT(*)::int FROM referrals) AS referrals,
      (SELECT COUNT(*)::int FROM queue_entries) AS queue_entries,
      (SELECT COUNT(*)::int FROM health_centers) AS health_centers
  `);

  console.log('Clinic dataset seed completed.');
  console.log(`Inserted referrals this run: ${referrals}`);
  console.log('Current totals:', counts.rows[0]);
  await pool.end();
}

main().catch(async (error) => {
  console.error('Clinic dataset seed failed:', error.message);
  console.error(error.stack);
  await pool.end().catch(() => {});
  process.exit(1);
});
