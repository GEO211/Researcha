import { query, queryOne } from './query.js';
import { sortByPriority, todayDateString, toDateString } from './helpers.js';
import { getPatient } from './store.js';
import { defaultInternalStatus, parseCategories, sanitizeCategories, serviceLabel } from '../../../../shared/visitRatings.js';

const TABLES = {
  patients: 'patients',
  referrals: 'referrals',
  queueEntries: 'queue_entries',
  healthCenters: 'health_centers',
  visitRatings: 'visit_ratings',
};

const ACTIVE_REFERRAL_STATUSES = ['submitted', 'under_review', 'queued'];
const TODAY_VISIBLE_STATUSES = ['completed', 'cancelled', 'missed', 'archived'];
const RATEABLE_STATUSES = ['completed', 'archived'];
const DEFAULT_WAIT_MINUTES = 10;
const QUEUE_LINE_LABELS = {
  E: 'Emergency line',
  V: 'Priority line',
  S: 'Standard line',
};
const STATUS_LABELS = {
  registered: 'Registered',
  waiting: 'Waiting',
  called: 'Called',
  in_consultation: 'In Consultation',
  waiting_for_service: 'Waiting for Service',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

const PROGRESS_STEPS = [
  { id: 'registered', label: 'Registration' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'called', label: 'Called' },
  { id: 'in_consultation', label: 'Consultation' },
  { id: 'completed', label: 'Completed' },
];

let ratingsTableReady = false;

export async function ensureVisitRatingsTable() {
  if (ratingsTableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS ${TABLES.visitRatings} (
      id SERIAL PRIMARY KEY,
      patient_id INT NOT NULL REFERENCES patients(id),
      referral_id INT NOT NULL REFERENCES referrals(id),
      queue_entry_id INT REFERENCES queue_entries(id),
      rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comments TEXT,
      categories JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_visit_ratings_referral UNIQUE (referral_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_visit_ratings_patient ON ${TABLES.visitRatings} (patient_id)`);
  await query(`ALTER TABLE ${TABLES.visitRatings} ADD COLUMN IF NOT EXISTS categories JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await query(`ALTER TABLE ${TABLES.visitRatings} ADD COLUMN IF NOT EXISTS internal_status VARCHAR(30) NOT NULL DEFAULT 'new'`);
  await query(`ALTER TABLE ${TABLES.visitRatings} ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE ${TABLES.visitRatings} ADD COLUMN IF NOT EXISTS reviewed_by_user_id INT`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_visit_ratings_referral ON ${TABLES.visitRatings} (referral_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_visit_ratings_status ON ${TABLES.visitRatings} (internal_status)`);
  await query(`UPDATE ${TABLES.visitRatings} SET internal_status = 'needs_attention' WHERE rating <= 2 AND internal_status = 'new'`);
  ratingsTableReady = true;
}

function serialize(row) {
  if (!row) return null;
  const out = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (value instanceof Date) out[key] = value.toISOString();
  }
  return out;
}

function personName(patient) {
  return [patient?.first_name, patient?.middle_name, patient?.last_name].filter(Boolean).join(' ').trim();
}

function mapVisitStatus(referral, queue) {
  const referralStatus = referral?.status;
  const queueStatus = queue?.queue_status;
  if (referralStatus === 'cancelled' || queueStatus === 'cancelled') return 'cancelled';
  if (referralStatus === 'missed' || queueStatus === 'missed') return 'no_show';
  if (referralStatus === 'rejected') return 'cancelled';
  if (referralStatus === 'completed' || referralStatus === 'archived') return 'completed';
  if (queueStatus === 'served') return 'in_consultation';
  if (referralStatus === 'expired' || queueStatus === 'expired') return 'cancelled';
  if (queueStatus === 'called') return 'called';
  if (queueStatus === 'waiting') return 'waiting';
  if (referralStatus === 'queued') return 'waiting_for_service';
  if (['submitted', 'under_review'].includes(referralStatus)) return 'registered';
  return 'registered';
}

function statusLabel(code) {
  return STATUS_LABELS[code] || code;
}

function progressForStatus(status) {
  const terminalFail = status === 'cancelled' || status === 'no_show';
  const currentId = {
    registered: 'registered',
    waiting: 'waiting',
    called: 'called',
    in_consultation: 'in_consultation',
    waiting_for_service: 'waiting',
    completed: 'completed',
    cancelled: 'registered',
    no_show: 'waiting',
  }[status] || 'registered';
  const currentIndex = PROGRESS_STEPS.findIndex((step) => step.id === currentId);

  return PROGRESS_STEPS.map((step, index) => ({
    ...step,
    state: terminalFail && index > currentIndex
      ? 'skipped'
      : index < currentIndex || status === 'completed'
        ? 'done'
        : index === currentIndex
          ? 'current'
          : 'upcoming',
  }));
}

function buildAlert(status, peopleAhead) {
  if (status === 'called') {
    return { code: 'called', message: 'You are currently being called. Please proceed to the consultation area.' };
  }
  if (status === 'in_consultation') {
    return { code: 'consultation', message: 'Your consultation has started.' };
  }
  if (status === 'completed') {
    return { code: 'completed', message: 'Your visit has been completed.' };
  }
  if (status === 'cancelled') {
    return { code: 'cancelled', message: 'This visit was cancelled.' };
  }
  if (status === 'no_show') {
    return { code: 'no_show', message: 'This visit was marked as no show.' };
  }
  if (status === 'waiting' && peopleAhead === 0) {
    return { code: 'next', message: 'Please proceed to the consultation area. You are next in line.' };
  }
  if (status === 'waiting' && peopleAhead > 0 && peopleAhead <= 2) {
    return { code: 'approaching', message: 'Your queue number is approaching.' };
  }
  if (status === 'waiting' && peopleAhead === 3) {
    return { code: 'position', message: 'You are now #3 in line.' };
  }
  return null;
}

function publicPatient(patient) {
  if (!patient) return null;
  return {
    id: Number(patient.id),
    full_name: personName(patient) || null,
    first_name: patient.first_name || null,
    middle_name: patient.middle_name || null,
    last_name: patient.last_name || null,
    birth_date: patient.birth_date ? String(patient.birth_date).slice(0, 10) : null,
    sex: patient.sex || null,
    contact_number: patient.contact_number || null,
    email: patient.email || null,
    address: patient.address || null,
    address2: patient.address2 || null,
    city: patient.city || null,
    province: patient.province || null,
    postal_code: patient.postal_code || null,
    health_center_name: patient.health_center_name || null,
  };
}

async function listPatientReferralRows(patientId) {
  const rows = await query(
    `SELECT r.*,
            q.id AS queue_entry_id,
            q.queue_number,
            q.queue_status,
            q.queue_date,
            q.called_at,
            q.served_at,
            q.missed_at,
            q.created_at AS queue_created_at,
            q.priority_band,
            q.priority_level,
            q.priority_score,
            hc_from.name AS referring_center_name,
            hc_to.name AS receiving_center_name
     FROM ${TABLES.referrals} r
     LEFT JOIN ${TABLES.queueEntries} q ON q.referral_id = r.id
     LEFT JOIN ${TABLES.healthCenters} hc_from ON hc_from.id = r.referring_health_center_id
     LEFT JOIN ${TABLES.healthCenters} hc_to ON hc_to.id = r.receiving_health_center_id
     WHERE r.patient_id = $1
     ORDER BY r.created_at DESC`,
    [Number(patientId)],
  );
  return rows.map(serialize);
}

async function ratingsByReferralIds(referralIds) {
  if (!referralIds.length) return new Map();
  await ensureVisitRatingsTable();
  const rows = await query(
    `SELECT * FROM ${TABLES.visitRatings} WHERE referral_id = ANY($1::int[])`,
    [referralIds],
  );
  return new Map(rows.map((row) => [Number(row.referral_id), serialize(row)]));
}

function queueFromRow(row) {
  if (!row?.queue_entry_id && !row?.queue_number) return null;
  return {
    id: row.queue_entry_id || null,
    queue_number: row.queue_number || null,
    queue_status: row.queue_status || null,
    queue_date: toDateString(row.queue_date) || null,
    called_at: row.called_at || null,
    served_at: row.served_at || null,
    missed_at: row.missed_at || null,
    created_at: row.queue_created_at || null,
    priority_band: row.priority_band || null,
    priority_level: row.priority_level || null,
    priority_score: row.priority_score ?? null,
  };
}

function publicRating(row) {
  if (!row) return null;
  return {
    rating: Number(row.rating),
    comments: row.comments || '',
    categories: parseCategories(row.categories),
    created_at: row.created_at,
  };
}

function visitSummary(row, rating) {
  const queue = queueFromRow(row);
  const status = mapVisitStatus(row, queue);
  const canRate = RATEABLE_STATUSES.includes(row.status) && !rating;
  return {
    id: Number(row.id),
    patient_id: Number(row.patient_id),
    tracking_code: row.referral_code,
    visit_number: row.referral_code,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at || null,
    appointment_at: row.appointment_at || null,
    completed_at: row.completed_at || null,
    queue_date: queue?.queue_date || row.queue_date || null,
    checked_in_at: queue?.created_at || null,
    called_at: queue?.called_at || null,
    served_at: queue?.served_at || null,
    department: row.receiving_center_name || null,
    assigned_line: assignedLineLabel(queue?.queue_number, row.receiving_center_name),
    referring_center_name: row.referring_center_name || null,
    queue_entry_id: queue?.id || null,
    queue_number: queue?.queue_number || null,
    referral_reason: row.referral_reason || null,
    referral_type: row.referral_type || null,
    service: serviceLabel(row.referral_type),
    clinical_urgency: row.clinical_urgency || null,
    status,
    status_label: statusLabel(status),
    referral_status: row.status,
    queue_status: queue?.queue_status || null,
    can_rate: canRate,
    rating: publicRating(rating),
  };
}

function assignedLineLabel(queueNumber, centerName) {
  const prefix = String(queueNumber || '').trim().charAt(0).toUpperCase();
  const line = QUEUE_LINE_LABELS[prefix] || null;
  if (line && centerName) return `${line} · ${centerName}`;
  return line || centerName || null;
}

function isSameManilaDate(value, today) {
  if (!value) return false;
  return String(value).slice(0, 10) === today;
}

function pickActiveVisit(rows, preferredCode) {
  const live = rows.filter((row) => ACTIVE_REFERRAL_STATUSES.includes(row.status));
  if (preferredCode) {
    const preferred = live.find((row) => String(row.referral_code).toLowerCase() === String(preferredCode).toLowerCase());
    if (preferred) return preferred;
  }
  if (live.length) return live[0];

  const today = todayDateString();
  return rows.find((row) => (
    TODAY_VISIBLE_STATUSES.includes(row.status)
    && (
      isSameManilaDate(row.queue_date, today)
      || isSameManilaDate(row.completed_at, today)
      || isSameManilaDate(row.created_at, today)
    )
  )) || null;
}

async function averageWaitMinutes(healthCenterId) {
  if (!healthCenterId) return DEFAULT_WAIT_MINUTES;
  const row = await queryOne(
    `SELECT AVG(EXTRACT(EPOCH FROM (q.served_at - q.created_at)) / 60.0) AS minutes
     FROM ${TABLES.queueEntries} q
     JOIN ${TABLES.referrals} r ON r.id = q.referral_id
     WHERE r.receiving_health_center_id = $1
       AND q.served_at IS NOT NULL
       AND q.served_at > q.created_at
       AND q.queue_date >= (CURRENT_DATE - INTERVAL '14 days')`,
    [Number(healthCenterId)],
  );
  const minutes = Number(row?.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return DEFAULT_WAIT_MINUTES;
  return Math.min(45, Math.max(4, Math.round(minutes)));
}

async function safeLineForVisit(visit) {
  const centerId = Number(visit.receiving_health_center_id);
  const queue = queueFromRow(visit);
  const queueDate = queue?.queue_date || toDateString(visit.queue_date) || todayDateString();
  const myStatus = mapVisitStatus(visit, queue);
  if (!centerId) {
    return { currently_serving: null, people_ahead: null, estimated_wait_minutes: null, line: [] };
  }

  const rows = (await query(
    `SELECT q.id, q.referral_id, q.queue_number, q.queue_status, q.called_at,
            q.created_at, q.priority_score, q.priority_band, q.priority_level, q.severity_rank,
            q.vulnerability_count
     FROM ${TABLES.queueEntries} q
     JOIN ${TABLES.referrals} r ON r.id = q.referral_id
     WHERE r.receiving_health_center_id = $1
       AND q.queue_date = $2::date
       AND r.status = 'queued'
       AND q.queue_status IN ('waiting', 'called')`,
    [centerId, queueDate],
  )).map(serialize);

  const called = rows
    .filter((entry) => entry.queue_status === 'called')
    .sort((a, b) => new Date(b.called_at || 0) - new Date(a.called_at || 0));
  const waiting = rows.filter((entry) => entry.queue_status === 'waiting').sort(sortByPriority);
  const ordered = [...called, ...waiting];
  const currentlyServing = called[0] || null;
  const myWaitingIndex = waiting.findIndex((entry) => Number(entry.referral_id) === Number(visit.id));
  const peopleAhead = myWaitingIndex >= 0
    ? myWaitingIndex + called.length
    : (['called', 'in_consultation', 'completed'].includes(myStatus) ? 0 : null);
  const avgWait = await averageWaitMinutes(centerId);
  const estimatedWait = Number.isInteger(peopleAhead) ? peopleAhead * avgWait : null;

  const line = ordered.map((entry, index) => {
    const isYou = Number(entry.referral_id) === Number(visit.id);
    const isServing = currentlyServing && Number(entry.id) === Number(currentlyServing.id);
    const waitingIndex = waiting.findIndex((item) => Number(item.id) === Number(entry.id));
    const position = entry.queue_status === 'waiting' ? waitingIndex + 1 : null;
    return {
      queue_number: entry.queue_number,
      position,
      status: isServing ? 'now_serving' : (isYou ? 'you' : entry.queue_status),
      status_label: isServing ? 'Now serving' : (isYou ? 'You' : statusLabel(mapVisitStatus({ status: 'queued' }, entry))),
      is_you: isYou,
      is_serving: Boolean(isServing),
      estimated_wait_minutes: waitingIndex >= 0 ? (waitingIndex + called.length) * avgWait : 0,
      order: index + 1,
    };
  });

  if (queue?.queue_number && !line.some((entry) => entry.is_you)) {
    line.push({
      queue_number: queue.queue_number,
      position: Number.isInteger(peopleAhead) ? peopleAhead + 1 : null,
      status: 'you',
      status_label: statusLabel(myStatus),
      is_you: true,
      is_serving: myStatus === 'called' || myStatus === 'in_consultation',
      estimated_wait_minutes: estimatedWait,
      order: line.length + 1,
    });
  }

  return {
    currently_serving: currentlyServing?.queue_number || (['called', 'in_consultation'].includes(myStatus) ? queue?.queue_number : null),
    people_ahead: Number.isInteger(peopleAhead) ? peopleAhead : null,
    estimated_wait_minutes: estimatedWait,
    average_service_minutes: avgWait,
    line,
  };
}

function visitTimeline(row, queue) {
  const steps = [
    { id: 'created', label: 'Visit created', at: row.created_at },
    { id: 'checked_in', label: 'Checked in', at: queue?.created_at || null },
    { id: 'waiting', label: 'Waiting', at: queue?.created_at || (row.status === 'queued' ? row.created_at : null) },
    { id: 'called', label: 'Called', at: queue?.called_at || null },
    { id: 'consultation', label: 'Consultation', at: queue?.served_at || null },
    { id: 'completed', label: 'Completed', at: row.completed_at || null },
  ];
  return steps.map((step) => ({ ...step, done: Boolean(step.at) }));
}

export async function getPatientPortalProfile(user) {
  const patient = await getPatient(user.patient_id);
  if (!patient) return null;
  return publicPatient(patient);
}

export async function getPatientPortalQueueStatus(user) {
  const patientId = Number(user.patient_id);
  if (!patientId) return null;
  const patient = await getPatient(patientId);
  if (!patient) return null;

  const rows = await listPatientReferralRows(patientId);
  const active = pickActiveVisit(rows, user.tracking_code);
  const queue = active ? queueFromRow(active) : null;
  const status = active ? mapVisitStatus(active, queue) : null;
  const line = active ? await safeLineForVisit(active) : { currently_serving: null, people_ahead: null, estimated_wait_minutes: null, line: [] };
  const peopleAhead = line.people_ahead;
  const ratings = await ratingsByReferralIds(active ? [Number(active.id)] : []);
  const visit = active ? visitSummary(active, ratings.get(Number(active.id))) : null;

  return {
    updated_at: new Date().toISOString(),
    patient: publicPatient(patient),
    active: visit
      ? {
        ...visit,
        patient_id: patientId,
        currently_serving: line.currently_serving,
        people_ahead: peopleAhead,
        estimated_wait_minutes: line.estimated_wait_minutes,
        assigned_line: visit.assigned_line || visit.department,
        date_of_visit: visit.queue_date || (visit.created_at ? String(visit.created_at).slice(0, 10) : null),
        check_in_at: visit.checked_in_at || visit.created_at,
        progress: progressForStatus(status),
        alert: buildAlert(status, peopleAhead),
      }
      : null,
    line: line.line,
  };
}

export async function listPatientPortalHistory(user) {
  const patientId = Number(user.patient_id);
  if (!patientId) return [];
  const rows = await listPatientReferralRows(patientId);
  const ratings = await ratingsByReferralIds(rows.map((row) => Number(row.id)));
  return rows.map((row) => visitSummary(row, ratings.get(Number(row.id))));
}

export async function listPatientRatings(user) {
  const visits = await listPatientPortalHistory(user);
  const completed = visits.filter((visit) => visit.status === 'completed' || RATEABLE_STATUSES.includes(visit.referral_status));
  return {
    awaiting: completed.filter((visit) => visit.can_rate),
    rated: completed.filter((visit) => Boolean(visit.rating)),
  };
}

export async function getPatientPortalVisit(user, code) {
  const patientId = Number(user.patient_id);
  const trackingCode = String(code || '').trim();
  if (!patientId || !trackingCode) return null;
  const rows = await listPatientReferralRows(patientId);
  const row = rows.find((item) => String(item.referral_code).toLowerCase() === trackingCode.toLowerCase()
    || String(item.id) === trackingCode);
  if (!row) return null;
  const ratings = await ratingsByReferralIds([Number(row.id)]);
  const summary = visitSummary(row, ratings.get(Number(row.id)));
  const queue = queueFromRow(row);
  return {
    ...summary,
    progress: progressForStatus(summary.status),
    timeline: visitTimeline(row, queue),
    patient: publicPatient(await getPatient(patientId)),
  };
}

export async function createPatientVisitRating(user, code, { rating, comments, categories: payloadCategories } = {}) {
  const visit = await getPatientPortalVisit(user, code);
  if (!visit) {
    const error = new Error('Visit not found.');
    error.status = 404;
    throw error;
  }
  if (!visit.can_rate && visit.rating) {
    const error = new Error('This visit already has a rating.');
    error.status = 409;
    throw error;
  }
  if (!RATEABLE_STATUSES.includes(visit.referral_status) && visit.status !== 'completed') {
    const error = new Error('You can rate a visit only after it is completed.');
    error.status = 409;
    throw error;
  }
  if (Number(user.patient_id) !== Number(visit.patient_id || user.patient_id)) {
    const error = new Error('You can only rate your own visit.');
    error.status = 403;
    throw error;
  }

  const score = Number(rating);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    const error = new Error('Choose a rating from 1 to 5.');
    error.status = 400;
    throw error;
  }

  await ensureVisitRatingsTable();
  const categories = sanitizeCategories(payloadCategories);
  if (!categories.overall) categories.overall = score;
  const internalStatus = defaultInternalStatus(score);
  try {
    const saved = serialize(await queryOne(
      `INSERT INTO ${TABLES.visitRatings} (patient_id, referral_id, queue_entry_id, rating, comments, categories, internal_status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING *`,
      [
        Number(user.patient_id),
        Number(visit.id),
        visit.queue_entry_id || null,
        score,
        String(comments || '').trim().slice(0, 1000) || null,
        JSON.stringify(categories),
        internalStatus,
      ],
    ));

    return publicRating(saved);
  } catch (error) {
    if (error.code === '23505' || String(error.message || '').includes('uq_visit_ratings_referral')) {
      const duplicate = new Error('This visit already has a rating.');
      duplicate.status = 409;
      throw duplicate;
    }
    throw error;
  }
}
