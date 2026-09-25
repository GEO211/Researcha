import { query, queryOne, withTransaction } from './query.js';
import {
  EXPIRABLE_REFERRAL_STATUSES,
  getHealthCenterMap,
  getHealthCenterName,
  getReferralQueueDate,
  getUserMap,
  isQueueDateExpired,
  matchesSearch,
  normalizeAppointmentAt,
  sortByPriority,
  stripUndefined,
  addDaysToDateString,
  anonymizePatientLabel,
  formatDateInAppTimezone,
  todayDateString,
  toDateString,
  buildUpdateClause,
} from './helpers.js';

const TABLES = {
  healthCenters: 'health_centers',
  users: 'users',
  patients: 'patients',
  referrals: 'referrals',
  queueEntries: 'queue_entries',
  priorityRules: 'priority_rules',
  systemSettings: 'system_settings',
  smsLogs: 'sms_logs',
  emailLogs: 'email_logs',
  auditLogs: 'audit_logs',
  performanceMetrics: 'performance_metrics',
};

function nowIso() {
  return new Date().toISOString();
}

function serializeRow(row) {
  if (!row) return null;
  const out = { ...row, id: Number(row.id) };
  for (const [key, value] of Object.entries(out)) {
    if (value instanceof Date) {
      out[key] = value.toISOString();
    }
  }
  return out;
}

function serializeRows(rows) {
  return rows.map(serializeRow);
}

async function select(sql, params = []) {
  return serializeRows(await query(sql, params));
}

async function selectOne(sql, params = []) {
  const rows = await select(sql, params);
  return rows[0] || null;
}

async function getRowById(table, id) {
  return selectOne(`SELECT * FROM ${table} WHERE id = $1`, [id]);
}

async function insertRow(table, data) {
  const entries = Object.entries(stripUndefined(data));
  const columns = entries.map(([key]) => key).join(', ');
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(', ');
  const values = entries.map(([, value]) => value);
  return selectOne(
    `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`,
    values,
  );
}

async function updateRowById(table, id, data) {
  const payload = stripUndefined(data);
  const { sql, values, nextIndex } = buildUpdateClause(payload);
  if (!sql) return getRowById(table, id);
  return selectOne(
    `UPDATE ${table} SET ${sql} WHERE id = $${nextIndex} RETURNING *`,
    [...values, id],
  );
}

async function txSelect(client, sql, params = []) {
  const result = await client.query(sql, params);
  return serializeRows(result.rows);
}

async function txSelectOne(client, sql, params = []) {
  const rows = await txSelect(client, sql, params);
  return rows[0] || null;
}

async function applyReferralExpiry(referral, queue, { persist = true } = {}) {
  if (!EXPIRABLE_REFERRAL_STATUSES.includes(referral.status) || !queue?.queue_date) {
    return { referral, queue };
  }

  const queueDate = toDateString(queue.queue_date);
  if (!isQueueDateExpired(queueDate)) {
    return { referral, queue };
  }

  const ts = nowIso();
  const nextReferral = { ...referral, status: 'expired', updated_at: ts };
  const nextQueue = queue?.id
    ? { ...queue, queue_status: 'expired', updated_at: ts }
    : queue;

  if (persist) {
    await query(
      `UPDATE ${TABLES.referrals} SET status = 'expired', updated_at = $1 WHERE id = $2`,
      [ts, referral.id],
    );
    if (queue?.id) {
      await query(
        `UPDATE ${TABLES.queueEntries} SET queue_status = 'expired', updated_at = $1 WHERE id = $2`,
        [ts, queue.id],
      );
    }
  }

  return { referral: nextReferral, queue: nextQueue };
}

function enrichReferralRecord(referral, { patientMap, centerMap, queueMap } = {}) {
  const patientId = Number(referral.patient_id);
  const referralId = Number(referral.id);
  const patient = patientMap?.get(patientId) || null;
  const fromCenter = centerMap?.get(Number(referral.referring_health_center_id)) || null;
  const toCenter = centerMap?.get(Number(referral.receiving_health_center_id)) || null;
  let queue = queueMap?.get(referralId) || null;

  // Soft-expire in memory during bulk lists (no per-row DB writes).
  const expired = applyReferralExpirySync(referral, queue);
  referral = expired.referral;
  queue = expired.queue;

  const queueDate = getReferralQueueDate(referral, queue);
  const appointmentAt = referral.appointment_at ? normalizeAppointmentAt(referral.appointment_at) : null;

  return {
    ...referral,
    tracking_code: referral.referral_code,
    patient_name: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
    first_name: patient?.first_name,
    last_name: patient?.last_name,
    contact_number: patient?.contact_number,
    is_senior: patient?.is_senior,
    is_pregnant: patient?.is_pregnant,
    is_pwd: patient?.is_pwd,
    is_child: patient?.is_child,
    is_infant: patient?.is_infant,
    is_indigenous: patient?.is_indigenous,
    is_solo_parent: patient?.is_solo_parent,
    email: patient?.email,
    referring_center_name: fromCenter?.name,
    receiving_center_name: toCenter?.name,
    home_barangay: patient?.address || fromCenter?.barangay_name || null,
    checkup_location: toCenter?.name || null,
    checkup_barangay: toCenter?.barangay_name || toCenter?.name || null,
    queue_number: queue?.queue_number || null,
    priority_level: queue?.priority_level || null,
    priority_score: queue?.priority_score ?? null,
    queue_status: queue?.queue_status || null,
    queue_date: queueDate,
    queue_entry_id: queue?.id || null,
    appointment_at: appointmentAt,
    appointment_time: appointmentAt,
    is_expired: referral.status === 'expired',
  };
}

function applyReferralExpirySync(referral, queue) {
  if (!EXPIRABLE_REFERRAL_STATUSES.includes(referral.status) || !queue?.queue_date) {
    return { referral, queue };
  }
  const queueDate = toDateString(queue.queue_date);
  if (!isQueueDateExpired(queueDate)) {
    return { referral, queue };
  }
  const ts = nowIso();
  return {
    referral: { ...referral, status: 'expired', updated_at: ts },
    queue: queue?.id ? { ...queue, queue_status: 'expired', updated_at: ts } : queue,
  };
}

async function enrichReferral(referral, { patientMap, centerMap, queueMap } = {}) {
  const patientId = Number(referral.patient_id);
  const referralId = Number(referral.id);
  const patient = patientMap?.get(patientId) || await getPatient(patientId);
  const fromCenter = centerMap?.get(Number(referral.referring_health_center_id))
    || await getHealthCenter(referral.referring_health_center_id);
  const toCenter = centerMap?.get(Number(referral.receiving_health_center_id))
    || await getHealthCenter(referral.receiving_health_center_id);
  let queue = queueMap?.get(referralId)
    || await selectOne(`SELECT * FROM ${TABLES.queueEntries} WHERE referral_id = $1 LIMIT 1`, [referralId]);

  const expired = await applyReferralExpiry(referral, queue, { persist: true });
  const nextReferral = expired.referral;
  queue = expired.queue;

  const queueDate = getReferralQueueDate(nextReferral, queue);
  const appointmentAt = nextReferral.appointment_at ? normalizeAppointmentAt(nextReferral.appointment_at) : null;

  return {
    ...nextReferral,
    tracking_code: nextReferral.referral_code,
    patient_name: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
    first_name: patient?.first_name,
    last_name: patient?.last_name,
    contact_number: patient?.contact_number,
    is_senior: patient?.is_senior,
    is_pregnant: patient?.is_pregnant,
    is_pwd: patient?.is_pwd,
    is_child: patient?.is_child,
    is_infant: patient?.is_infant,
    is_indigenous: patient?.is_indigenous,
    is_solo_parent: patient?.is_solo_parent,
    email: patient?.email,
    referring_center_name: fromCenter?.name,
    receiving_center_name: toCenter?.name,
    home_barangay: patient?.address || fromCenter?.barangay_name || null,
    checkup_location: toCenter?.name || null,
    checkup_barangay: toCenter?.barangay_name || toCenter?.name || null,
    queue_number: queue?.queue_number || null,
    priority_level: queue?.priority_level || null,
    priority_score: queue?.priority_score ?? null,
    queue_status: queue?.queue_status || null,
    queue_date: queueDate,
    queue_entry_id: queue?.id || null,
    appointment_at: appointmentAt,
    appointment_time: appointmentAt,
    is_expired: nextReferral.status === 'expired',
  };
}

export async function listHealthCenters() {
  const rows = await select(`SELECT * FROM ${TABLES.healthCenters}`);
  return rows.sort((a, b) => `${a.type}${a.name}`.localeCompare(`${b.type}${b.name}`));
}

export async function ensureKoronadalBarangayCenters() {
  const {
    KORONADAL_BARANGAYS,
    barangayHealthCenterName,
    barangayAddressLabel,
    findHealthCenterForBarangay,
  } = await import('../../data/koronadalBarangays.js');
  const existing = await select(`SELECT * FROM ${TABLES.healthCenters}`);

  for (const barangay of KORONADAL_BARANGAYS) {
    const match = findHealthCenterForBarangay(barangay, existing);
    const name = barangayHealthCenterName(barangay);
    const address = `${barangayAddressLabel(barangay)}, Koronadal City, South Cotabato`;

    if (match) {
      await query(
        `UPDATE ${TABLES.healthCenters}
         SET barangay_name = $1, updated_at = NOW()
         WHERE id = $2`,
        [barangay, match.id],
      );
      match.barangay_name = barangay;
      continue;
    }

    const created = await insertRow(TABLES.healthCenters, {
      name,
      type: 'barangay',
      address,
      contact_number: null,
      status: 'active',
      barangay_name: barangay,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    existing.push(created);
  }

  return listHealthCenters();
}

export async function getHealthCenter(id) {
  return getRowById(TABLES.healthCenters, id);
}

export async function createHealthCenter(data) {
  const ts = nowIso();
  return insertRow(TABLES.healthCenters, { ...data, created_at: ts, updated_at: ts });
}

export async function updateHealthCenter(id, data) {
  await updateRowById(TABLES.healthCenters, id, { ...data, updated_at: nowIso() });
  return getHealthCenter(id);
}

export async function findUserByEmail(email) {
  const user = await selectOne(
    `SELECT * FROM ${TABLES.users} WHERE email = $1 AND status = 'active' LIMIT 1`,
    [email],
  );
  if (!user) return null;
  user.health_center_name = await getHealthCenterName(user.health_center_id);
  return user;
}

export async function getUser(id) {
  return getRowById(TABLES.users, id);
}

export async function listUsers() {
  const [users, centerMap] = await Promise.all([
    select(`SELECT * FROM ${TABLES.users}`),
    getHealthCenterMap(),
  ]);
  return users
    .map((user) => ({
      ...user,
      health_center_name: user.health_center_id ? centerMap.get(Number(user.health_center_id))?.name || null : null,
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function createUser(data) {
  const ts = nowIso();
  return insertRow(TABLES.users, { ...data, created_at: ts, updated_at: ts });
}

export async function updateUser(id, data) {
  await updateRowById(TABLES.users, id, { ...data, updated_at: nowIso() });
  return getUser(id);
}

export async function updateUserLastLogin(id) {
  const ts = nowIso();
  await query(
    `UPDATE ${TABLES.users} SET last_login_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id],
  );
}

export async function listPatients(filters = {}) {
  const [rows, centerMap] = await Promise.all([
    select(`SELECT * FROM ${TABLES.patients}`),
    getHealthCenterMap(),
  ]);
  let patients = rows.map((patient) => ({
    ...patient,
    health_center_name: centerMap.get(Number(patient.health_center_id))?.name || null,
  }));

  if (filters.healthCenterId) {
    patients = patients.filter((p) => p.health_center_id === filters.healthCenterId);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    patients = patients.filter((p) =>
      [p.first_name, p.middle_name, p.last_name, p.contact_number, p.email, p.address, p.address2, p.city, p.province, p.postal_code, p.health_center_name]
        .some((v) => matchesSearch(v, q)),
    );
  }
  if (filters.city) patients = patients.filter((p) => matchesSearch(p.city, filters.city));
  if (filters.province) patients = patients.filter((p) => matchesSearch(p.province, filters.province));
  if (filters.contactNumber) patients = patients.filter((p) => matchesSearch(p.contact_number, filters.contactNumber));
  if (filters.email) patients = patients.filter((p) => matchesSearch(p.email, filters.email));

  return patients.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);
}

async function attachPatientCenter(patient) {
  if (!patient) return patient;
  return {
    ...patient,
    health_center_name: await getHealthCenterName(patient.health_center_id),
  };
}

export async function getPatient(id) {
  return attachPatientCenter(await getRowById(TABLES.patients, id));
}

export async function findDuplicatePatient({
  first_name,
  last_name,
  birth_date,
  contact_number,
  email,
  excludeId,
} = {}) {
  const clauses = [];
  const params = [];

  if (first_name && last_name && birth_date) {
    params.push(first_name, last_name, String(birth_date).slice(0, 10));
    clauses.push(
      `(lower(btrim(first_name)) = lower(btrim($${params.length - 2})) AND lower(btrim(last_name)) = lower(btrim($${params.length - 1})) AND birth_date = $${params.length}::date)`,
    );
  }

  const contactDigits = String(contact_number || '').replace(/\D/g, '');
  if (contactDigits) {
    params.push(contactDigits);
    clauses.push(
      `(contact_number IS NOT NULL AND btrim(contact_number) <> '' AND regexp_replace(contact_number, '\\D', '', 'g') = $${params.length})`,
    );
  }

  const emailKey = String(email || '').trim().toLowerCase();
  if (emailKey) {
    params.push(emailKey);
    clauses.push(
      `(email IS NOT NULL AND btrim(email) <> '' AND lower(btrim(email)) = $${params.length})`,
    );
  }

  if (!clauses.length) return null;

  let sql = `SELECT * FROM ${TABLES.patients} WHERE (${clauses.join(' OR ')})`;
  if (excludeId) {
    params.push(Number(excludeId));
    sql += ` AND id <> $${params.length}`;
  }
  sql += ' ORDER BY id ASC LIMIT 1';

  const row = await selectOne(sql, params);
  if (!row) return null;

  const sameName = String(row.first_name || '').trim().toLowerCase() === String(first_name || '').trim().toLowerCase()
    && String(row.last_name || '').trim().toLowerCase() === String(last_name || '').trim().toLowerCase()
    && String(row.birth_date || '').slice(0, 10) === String(birth_date || '').slice(0, 10);
  const sameContact = contactDigits && String(row.contact_number || '').replace(/\D/g, '') === contactDigits;
  const sameEmail = emailKey && String(row.email || '').trim().toLowerCase() === emailKey;
  let reason = 'identity';
  if (!sameName && sameContact) reason = 'contact';
  else if (!sameName && sameEmail) reason = 'email';

  return { ...row, match_reason: reason };
}

export async function createPatient(data) {
  const ts = nowIso();
  const created = await insertRow(TABLES.patients, { ...data, created_at: ts, updated_at: ts });
  return attachPatientCenter(created);
}

export async function updatePatient(id, data) {
  const { created_at: _createdAt, health_center_name: _centerName, ...payload } = data;
  await updateRowById(TABLES.patients, id, { ...payload, updated_at: nowIso() });
  return getPatient(id);
}

export async function listReferrals(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 300, 1), 1000);

  let referralSql = `SELECT * FROM ${TABLES.referrals}`;
  const referralParams = [];
  if (filters.healthCenterId) {
    referralParams.push(Number(filters.healthCenterId));
    referralSql += ` WHERE referring_health_center_id = $1 OR receiving_health_center_id = $1`;
  }
  referralSql += ` ORDER BY created_at DESC LIMIT $${referralParams.length + 1}`;
  referralParams.push(limit);

  const referrals = await select(referralSql, referralParams);
  const referralIds = referrals.map((row) => Number(row.id)).filter(Boolean);
  const patientIds = [...new Set(referrals.map((row) => Number(row.patient_id)).filter(Boolean))];

  const [patients, centers, queues] = await Promise.all([
    patientIds.length
      ? select(`SELECT * FROM ${TABLES.patients} WHERE id = ANY($1::int[])`, [patientIds])
      : Promise.resolve([]),
    select(`SELECT * FROM ${TABLES.healthCenters}`),
    referralIds.length
      ? select(`SELECT * FROM ${TABLES.queueEntries} WHERE referral_id = ANY($1::int[])`, [referralIds])
      : Promise.resolve([]),
  ]);

  const patientMap = new Map(patients.map((p) => [Number(p.id), p]));
  const centerMap = new Map(centers.map((c) => [Number(c.id), c]));
  const queueMap = new Map(queues.map((q) => [Number(q.referral_id), q]));

  let rows = referrals;
  if (filters.priorityLevel) {
    rows = rows.filter((r) => queueMap.get(Number(r.id))?.priority_level === filters.priorityLevel);
  }
  if (filters.q) {
    rows = rows.filter((r) => {
      const patient = patientMap.get(Number(r.patient_id));
      return matchesSearch(r.referral_code, filters.q)
        || matchesSearch(patient?.first_name, filters.q)
        || matchesSearch(patient?.last_name, filters.q)
        || matchesSearch(patient?.contact_number, filters.q);
    });
  }

  rows = rows.map((r) => enrichReferralRecord(r, { patientMap, centerMap, queueMap }));
  if (filters.status) rows = rows.filter((r) => r.status === filters.status);
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function getReferral(id) {
  const referral = await getRowById(TABLES.referrals, id);
  if (!referral) return null;
  return enrichReferral(referral);
}

export async function findReferralByCode(code) {
  const referral = await selectOne(
    `SELECT * FROM ${TABLES.referrals} WHERE referral_code = $1 LIMIT 1`,
    [code],
  );
  if (!referral) return null;
  return enrichReferral(referral);
}

export async function countTodayQueueEntries() {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS count FROM ${TABLES.queueEntries} WHERE queue_date = $1`,
    [todayDateString()],
  );
  return row?.count || 0;
}

export async function createReferral({ payload, patientId }) {
  const ts = nowIso();
  const referralData = stripUndefined({
    ...payload,
    patient_id: patientId,
    status: 'submitted',
    created_at: ts,
    updated_at: ts,
  });

  const referralEntries = Object.entries(referralData);
  const referralColumns = referralEntries.map(([key]) => key).join(', ');
  const referralPlaceholders = referralEntries.map((_, index) => `$${index + 1}`).join(', ');
  const referralValues = referralEntries.map(([, value]) => value);

  const referralResult = await queryOne(
    `INSERT INTO ${TABLES.referrals} (${referralColumns}) VALUES (${referralPlaceholders}) RETURNING *`,
    referralValues,
  );
  const referral = serializeRow(referralResult);

  return {
    referralId: referral.id,
    referral,
  };
}

export async function createReferralWithQueue({
  payload,
  patientId,
  priorityLevel,
  priorityScore,
  queueNumber,
  userId = null,
  appointmentAt = null,
  status = 'queued',
}) {
  const ts = nowIso();
  const today = todayDateString();
  const normalizedAppointmentAt = appointmentAt ? normalizeAppointmentAt(appointmentAt) : null;

  return withTransaction(async (client) => {
    const referralData = stripUndefined({
      ...payload,
      patient_id: patientId,
      status,
      reviewed_by_user_id: userId,
      reviewed_at: status === 'queued' ? ts : null,
      appointment_at: normalizedAppointmentAt,
      created_at: ts,
      updated_at: ts,
    });

    const referralEntries = Object.entries(referralData);
    const referralColumns = referralEntries.map(([key]) => key).join(', ');
    const referralPlaceholders = referralEntries.map((_, index) => `$${index + 1}`).join(', ');
    const referralValues = referralEntries.map(([, value]) => value);

    const referralResult = await client.query(
      `INSERT INTO ${TABLES.referrals} (${referralColumns}) VALUES (${referralPlaceholders}) RETURNING *`,
      referralValues,
    );
    const referral = serializeRow(referralResult.rows[0]);
    const referralId = referral.id;

    const queueResult = await client.query(
      `INSERT INTO ${TABLES.queueEntries}
        (referral_id, patient_id, queue_number, priority_level, priority_score, queue_status, queue_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [referralId, patientId, queueNumber, priorityLevel, priorityScore, 'waiting', today, ts, ts],
    );
    const queueEntry = serializeRow(queueResult.rows[0]);

    return {
      referralId,
      queueEntryId: queueEntry.id,
      queueNumber,
    };
  });
}

export async function approveReferralWithQueue({ id, userId, appointmentAt, priorityLevel, priorityScore, queueNumber }) {
  return withTransaction(async (client) => {
    const referral = await txSelectOne(client, `SELECT * FROM ${TABLES.referrals} WHERE id = $1`, [id]);
    if (!referral) {
      const error = new Error('Referral not found.');
      error.status = 404;
      throw error;
    }
    if (!['submitted', 'under_review'].includes(referral.status)) {
      const error = new Error(`Referral cannot be approved from status ${referral.status}.`);
      error.status = 409;
      throw error;
    }

    const patient = await getPatient(referral.patient_id);
    const ts = nowIso();
    const normalizedAppointmentAt = appointmentAt ? normalizeAppointmentAt(appointmentAt) : null;

    await client.query(
      `UPDATE ${TABLES.referrals}
       SET status = 'queued', reviewed_by_user_id = $1, reviewed_at = $2, appointment_at = $3, updated_at = $4
       WHERE id = $5`,
      [userId, ts, normalizedAppointmentAt, ts, id],
    );

    const queueResult = await client.query(
      `INSERT INTO ${TABLES.queueEntries}
        (referral_id, patient_id, queue_number, priority_level, priority_score, queue_status, queue_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, referral.patient_id, queueNumber, priorityLevel, priorityScore, 'waiting', todayDateString(), ts, ts],
    );
    const queueEntry = serializeRow(queueResult.rows[0]);

    return {
      referral: {
        ...referral,
        status: 'queued',
        reviewed_by_user_id: userId,
        reviewed_at: ts,
        appointment_at: normalizedAppointmentAt,
        patient_id: referral.patient_id,
        contact_number: patient?.contact_number,
        queue_entry_id: queueEntry.id,
        queue_number: queueNumber,
      },
      queueEntryId: queueEntry.id,
      queueNumber,
      priorityLevel,
      priorityScore,
    };
  });
}

export async function updateReferral(id, data) {
  const payload = { ...data };
  if ('appointment_at' in payload) {
    payload.appointment_at = normalizeAppointmentAt(payload.appointment_at);
  }
  await updateRowById(TABLES.referrals, id, { ...payload, updated_at: nowIso() });
  return getReferral(id);
}

export async function transferReferralLocation(id, receivingHealthCenterId) {
  await updateRowById(TABLES.referrals, id, {
    receiving_health_center_id: Number(receivingHealthCenterId),
    updated_at: nowIso(),
  });
  return getReferral(id);
}

export async function getQueueEntryByReferral(referralId) {
  return selectOne(
    `SELECT * FROM ${TABLES.queueEntries} WHERE referral_id = $1 LIMIT 1`,
    [referralId],
  );
}

export async function updateQueueEntry(id, data) {
  await updateRowById(TABLES.queueEntries, id, { ...data, updated_at: nowIso() });
  return getQueueEntry(id);
}

export async function updateQueueByReferral(referralId, data) {
  const entry = await getQueueEntryByReferral(referralId);
  if (!entry) return null;
  return updateQueueEntry(entry.id, data);
}

export async function completeReferral(id) {
  const referral = await getRowById(TABLES.referrals, id);
  if (!referral || referral.status !== 'queued') return false;
  const ts = nowIso();
  await query(
    `UPDATE ${TABLES.referrals} SET status = 'completed', completed_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id],
  );
  await updateQueueByReferral(id, { queue_status: 'served', served_at: ts });
  return true;
}

export async function missReferral(id) {
  const referral = await getReferral(id);
  if (!referral || referral.status !== 'queued') return null;
  const ts = nowIso();
  await query(
    `UPDATE ${TABLES.referrals} SET status = 'missed', updated_at = $1 WHERE id = $2`,
    [ts, id],
  );
  await updateQueueByReferral(id, { queue_status: 'missed', missed_at: ts });
  return referral;
}

export async function cancelReferral(id) {
  const referral = await getRowById(TABLES.referrals, id);
  if (!referral || referral.status !== 'queued') return false;
  await query(
    `UPDATE ${TABLES.referrals} SET status = 'archived', updated_at = $1 WHERE id = $2`,
    [nowIso(), id],
  );
  await updateQueueByReferral(id, { queue_status: 'cancelled' });
  return true;
}

function enrichQueueEntries(queues, { referrals, patients, centers }) {
  const referralMap = new Map(referrals.map((r) => [Number(r.id), r]));
  const patientMap = new Map(patients.map((p) => [Number(p.id), p]));
  const centerMap = new Map(centers.map((c) => [Number(c.id), c]));

  return queues
    .map((entry) => {
      const referral = referralMap.get(Number(entry.referral_id));
      if (!referral) return null; // only show queue rows tied to real referral records
      const patient = patientMap.get(Number(entry.patient_id))
        || patientMap.get(Number(referral.patient_id));
      const center = centerMap.get(Number(referral.referring_health_center_id));
      const receiving = centerMap.get(Number(referral.receiving_health_center_id));
      return {
        ...entry,
        status: entry.queue_status,
        queue_status: entry.queue_status,
        tracking_code: referral.referral_code || null,
        referral_code: referral.referral_code,
        referral_status: referral.status,
        referral_id: referral.id,
        receiving_health_center_id: referral.receiving_health_center_id,
        referring_health_center_id: referral.referring_health_center_id,
        appointment_at: referral.appointment_at || null,
        patient_name: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        first_name: patient?.first_name,
        last_name: patient?.last_name,
        contact_number: patient?.contact_number,
        referring_center_name: center?.name || null,
        receiving_center_name: receiving?.name || null,
        home_barangay: patient?.address || center?.barangay_name || null,
        checkup_location: receiving?.name || null,
        checkup_barangay: receiving?.barangay_name || receiving?.name || null,
      };
    })
    .filter(Boolean);
}

function resolveQueueDateWindow(filters = {}) {
  const today = todayDateString();
  const range = String(filters.range || 'today').toLowerCase();

  if (range === 'all') {
    return { range: 'all', fromDate: null, toDate: null };
  }
  if (range === 'active') {
    // Matches Referral Records → Active (queued referrals still in line).
    return { range: 'active', fromDate: null, toDate: null };
  }
  if (range === 'yesterday') {
    const yesterday = addDaysToDateString(today, -1);
    return { range, fromDate: yesterday, toDate: yesterday };
  }
  if (range === 'last_7_days') {
    return { range, fromDate: addDaysToDateString(today, -6), toDate: today };
  }
  if (range === 'last_30_days') {
    return { range, fromDate: addDaysToDateString(today, -29), toDate: today };
  }
  if (range === 'custom' && filters.date) {
    const date = toDateString(filters.date) || String(filters.date).slice(0, 10);
    return { range: 'custom', fromDate: date, toDate: date };
  }
  return { range: 'today', fromDate: today, toDate: today };
}

function queueDateKey(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return formatDateInAppTimezone(date);
}

/** Live queue rows joined to real referral records. */
export async function listQueueEntries(filters = {}) {
  const window = resolveQueueDateWindow(filters);
  const statusFilter = filters.status && String(filters.status).toLowerCase() !== 'all'
    ? String(filters.status).toLowerCase()
    : '';
  const priorityFilter = filters.priority && String(filters.priority).toLowerCase() !== 'all'
    ? String(filters.priority).toLowerCase()
    : '';
  const referralStatusFilter = filters.referral_status && String(filters.referral_status).toLowerCase() !== 'all'
    ? String(filters.referral_status).toLowerCase()
    : '';
  const search = String(filters.q || '').trim();

  const [allQueues, referrals, patients, centers] = await Promise.all([
    select(`SELECT * FROM ${TABLES.queueEntries}`),
    select(`SELECT * FROM ${TABLES.referrals}`),
    select(`SELECT * FROM ${TABLES.patients}`),
    select(`SELECT * FROM ${TABLES.healthCenters}`),
  ]);

  let rows = enrichQueueEntries(allQueues, { referrals, patients, centers });

  if (filters.receivingHealthCenterId) {
    const centerId = Number(filters.receivingHealthCenterId);
    rows = rows.filter((entry) => Number(entry.receiving_health_center_id) === centerId
      || Number(referrals.find((item) => Number(item.id) === Number(entry.referral_id))?.receiving_health_center_id) === centerId);
  }

  if (window.range === 'active') {
    rows = rows.filter((entry) => entry.referral_status === 'queued'
      && ['waiting', 'called'].includes(entry.queue_status));
  } else if (window.fromDate && window.toDate) {
    const inWindow = rows.filter((entry) => {
      const key = queueDateKey(entry.queue_date);
      return key >= window.fromDate && key <= window.toDate;
    });

    if (window.range === 'today') {
      // Keep today's board visible AND always include live queued referral records.
      const activeQueued = rows.filter((entry) => entry.referral_status === 'queued'
        && ['waiting', 'called'].includes(entry.queue_status));
      const byId = new Map();
      for (const entry of [...inWindow, ...activeQueued]) byId.set(Number(entry.id), entry);
      rows = [...byId.values()];
    } else {
      rows = inWindow;
    }
  }

  // Active "today" view hides cancelled/expired noise unless a status filter is set.
  if ((window.range === 'today' || window.range === 'active') && !statusFilter && !referralStatusFilter) {
    rows = rows.filter((entry) => !['cancelled', 'expired'].includes(entry.queue_status)
      && entry.referral_status !== 'archived'
      && entry.referral_status !== 'expired'
      && entry.referral_status !== 'rejected');
  }

  if (statusFilter) {
    rows = rows.filter((entry) => String(entry.queue_status).toLowerCase() === statusFilter);
  }
  if (referralStatusFilter) {
    rows = rows.filter((entry) => String(entry.referral_status).toLowerCase() === referralStatusFilter);
  }
  if (priorityFilter) {
    rows = rows.filter((entry) => String(entry.priority_level).toLowerCase() === priorityFilter);
  }
  if (search) {
    rows = rows.filter((entry) => matchesSearch(entry.patient_name, search)
      || matchesSearch(entry.first_name, search)
      || matchesSearch(entry.last_name, search)
      || matchesSearch(entry.queue_number, search)
      || matchesSearch(entry.referral_code, search)
      || matchesSearch(entry.referring_center_name, search)
      || matchesSearch(entry.receiving_center_name, search)
      || matchesSearch(entry.contact_number, search)
      || matchesSearch(entry.referral_status, search));
  }

  rows = rows.sort((a, b) => {
    const activeA = a.referral_status === 'queued' ? 0 : 1;
    const activeB = b.referral_status === 'queued' ? 0 : 1;
    if (activeA !== activeB) return activeA - activeB;
    const dateCmp = queueDateKey(b.queue_date).localeCompare(queueDateKey(a.queue_date));
    if (dateCmp !== 0) return dateCmp;
    return sortByPriority(a, b);
  });

  const counts = rows.reduce((acc, entry) => {
    const key = entry.queue_status || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const referralCounts = rows.reduce((acc, entry) => {
    const key = entry.referral_status || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    queue: rows,
    meta: {
      range: window.range,
      from_date: window.fromDate,
      to_date: window.toDate,
      total: rows.length,
      counts,
      referral_counts: referralCounts,
      data_source: 'supabase',
      synced_with: 'referrals',
    },
  };
}

export async function listTodayQueue(filters = {}) {
  const result = await listQueueEntries({ range: 'today', ...filters });
  return result.queue;
}

export async function getQueueEntry(id) {
  return getRowById(TABLES.queueEntries, id);
}

export async function callQueueEntry(id) {
  const entry = await getQueueEntry(id);
  if (!entry || !['waiting', 'called'].includes(entry.queue_status)) return null;

  const ts = nowIso();
  await updateQueueEntry(id, { queue_status: 'called', called_at: ts });
  return { ...entry, queue_status: 'called', called_at: ts };
}

export async function listPriorityRules() {
  const rows = await select(`SELECT * FROM ${TABLES.priorityRules}`);
  return rows.sort((a, b) => `${a.category}${a.condition_key}`.localeCompare(`${b.category}${b.condition_key}`));
}

export async function getActivePriorityRules() {
  return select(`SELECT * FROM ${TABLES.priorityRules} WHERE is_active = TRUE`);
}

export async function updatePriorityRule(id, data) {
  await updateRowById(TABLES.priorityRules, id, { ...data, updated_at: nowIso() });
  return getRowById(TABLES.priorityRules, id);
}

export async function listSystemSettings() {
  const rows = await select(`SELECT * FROM ${TABLES.systemSettings}`);
  return rows.sort((a, b) => a.setting_key.localeCompare(b.setting_key));
}

export async function getSystemSetting(key) {
  return selectOne(
    `SELECT * FROM ${TABLES.systemSettings} WHERE setting_key = $1 LIMIT 1`,
    [key],
  );
}

export async function upsertSystemSetting(key, data) {
  const existing = await getSystemSetting(key);
  const ts = nowIso();
  const description = data.description ?? existing?.description ?? null;

  return selectOne(
    `INSERT INTO ${TABLES.systemSettings} (setting_key, setting_value, description, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (setting_key) DO UPDATE SET
       setting_value = EXCLUDED.setting_value,
       description = COALESCE(EXCLUDED.description, ${TABLES.systemSettings}.description),
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [key, data.setting_value, description, ts, ts],
  );
}

export async function createSmsLog(data) {
  const ts = nowIso();
  const row = await insertRow(TABLES.smsLogs, { ...data, created_at: ts, updated_at: ts });
  return row.id;
}

export async function createEmailLog(data) {
  const ts = nowIso();
  const row = await insertRow(TABLES.emailLogs, { ...data, created_at: ts, updated_at: ts });
  return row.id;
}

export async function listSmsLogs(limit = 100) {
  const [logs, patients, referrals] = await Promise.all([
    select(`SELECT * FROM ${TABLES.smsLogs}`),
    select(`SELECT * FROM ${TABLES.patients}`),
    select(`SELECT * FROM ${TABLES.referrals}`),
  ]);

  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const referralMap = new Map(referrals.map((r) => [r.id, r]));

  return logs
    .map((log) => {
      const patient = patientMap.get(log.patient_id);
      const referral = log.referral_id ? referralMap.get(log.referral_id) : null;
      return {
        ...log,
        first_name: patient?.first_name,
        last_name: patient?.last_name,
        referral_code: referral?.referral_code,
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

export async function hasSmsReminder(referralId) {
  const row = await queryOne(
    `SELECT 1 FROM ${TABLES.smsLogs} WHERE referral_id = $1 AND trigger_type = 'appointment_reminder' LIMIT 1`,
    [referralId],
  );
  return Boolean(row);
}

export async function hasSentSms(referralId, triggerType) {
  if (!referralId || !triggerType) return false;
  const row = await queryOne(
    `SELECT 1 FROM ${TABLES.smsLogs} WHERE referral_id = $1 AND trigger_type = $2 AND status = 'sent' LIMIT 1`,
    [referralId, triggerType],
  );
  return Boolean(row);
}

export async function hasEmailReminder(referralId) {
  const row = await queryOne(
    `SELECT 1 FROM ${TABLES.emailLogs} WHERE referral_id = $1 AND trigger_type = 'appointment_reminder' LIMIT 1`,
    [referralId],
  );
  return Boolean(row);
}

export async function createAuditLog(data) {
  const row = await insertRow(TABLES.auditLogs, { ...data, created_at: nowIso() });
  return row.id;
}

export async function listAuditLogs(filters = {}) {
  const [logs, users] = await Promise.all([
    select(`SELECT * FROM ${TABLES.auditLogs}`),
    getUserMap(),
  ]);

  let rows = logs.map((log) => ({
    ...log,
    user_name: log.user_id ? users.get(Number(log.user_id))?.name : null,
    user_email: log.user_id ? users.get(Number(log.user_id))?.email : null,
  }));

  if (filters.action) rows = rows.filter((l) => matchesSearch(l.action, filters.action));
  if (filters.userId) rows = rows.filter((l) => l.user_id === filters.userId);

  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 200);
}

export async function createPerformanceMetric(data) {
  const row = await insertRow(TABLES.performanceMetrics, { ...data, created_at: nowIso() });
  return row.id;
}

export async function getDashboardSummary(user) {
  if (user?.role === 'patient') {
    const tracking = user.tracking_code ? await getPublicTracking(user.tracking_code) : null;
    return {
      patientPortal: true,
      tracking,
      patientCount: 1,
      referralCounts: tracking ? [{ status: tracking.display_status || tracking.status, count: 1 }] : [],
      queueCounts: [],
      smsCounts: [],
      operationalCounts: {},
      demographicDistribution: {},
      referralTrend: [],
      centerDistribution: [],
      urgencyDistribution: [],
      performanceMetrics: [],
    };
  }

  const roleFilter = user.role === 'barangay_staff' ? user.health_center_id : null;

  // Always read full tables from the database (not listReferrals/listPatients which cap at 100).
  const [referrals, patients, queue, smsLogs, perf, servedQueueRows] = await Promise.all([
    roleFilter
      ? select(
        `SELECT r.*, hc_from.name AS referring_center_name, hc_to.name AS receiving_center_name
         FROM ${TABLES.referrals} r
         LEFT JOIN ${TABLES.healthCenters} hc_from ON hc_from.id = r.referring_health_center_id
         LEFT JOIN ${TABLES.healthCenters} hc_to ON hc_to.id = r.receiving_health_center_id
         WHERE r.referring_health_center_id = $1`,
        [roleFilter],
      )
      : select(
        `SELECT r.*, hc_from.name AS referring_center_name, hc_to.name AS receiving_center_name
         FROM ${TABLES.referrals} r
         LEFT JOIN ${TABLES.healthCenters} hc_from ON hc_from.id = r.referring_health_center_id
         LEFT JOIN ${TABLES.healthCenters} hc_to ON hc_to.id = r.receiving_health_center_id`,
      ),
    roleFilter
      ? select(`SELECT * FROM ${TABLES.patients} WHERE health_center_id = $1`, [roleFilter])
      : select(`SELECT * FROM ${TABLES.patients}`),
    listTodayQueue(),
    select(`SELECT status, trigger_type FROM ${TABLES.smsLogs}`),
    select(`SELECT operation, duration_ms FROM ${TABLES.performanceMetrics}`),
    select(
      `SELECT created_at, served_at FROM ${TABLES.queueEntries}
       WHERE served_at IS NOT NULL
       ORDER BY served_at DESC
       LIMIT 5000`,
    ),
  ]);

  const today = todayDateString();
  const referralCounts = Object.entries(referrals.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {})).map(([status, count]) => ({ status, count }));

  const queueCounts = Object.entries(queue.reduce((acc, q) => {
    const key = `${q.priority_level}|${q.queue_status}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).map(([key, count]) => {
    const [priority_level, queue_status] = key.split('|');
    return { priority_level, queue_status, count };
  });

  const smsCounts = Object.entries(smsLogs.reduce((acc, s) => {
    const key = `${s.status}|${s.trigger_type}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).map(([key, count]) => {
    const [status, trigger_type] = key.split('|');
    return { status, trigger_type, count };
  });

  const openStatuses = new Set(['submitted', 'under_review', 'queued']);
  const operationalCounts = {
    open_referrals: referrals.filter((r) => openStatuses.has(r.status)).length,
    pending_review: referrals.filter((r) => ['submitted', 'under_review'].includes(r.status)).length,
    submitted_today: referrals.filter((r) => toDateString(r.created_at) === today).length,
    completed_today: referrals.filter((r) => r.status === 'completed' && toDateString(r.completed_at) === today).length,
    missed_today: referrals.filter((r) => r.status === 'missed' && toDateString(r.updated_at) === today).length,
    waiting_queue: queue.filter((q) => q.queue_status === 'waiting').length,
    completion_rate: referrals.length
      ? Math.round((referrals.filter((r) => r.status === 'completed').length / referrals.length) * 100)
      : 0,
  };

  const trendMap = new Map();
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    trendMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of referrals) {
    const date = toDateString(r.created_at);
    if (trendMap.has(date)) trendMap.set(date, trendMap.get(date) + 1);
  }
  const referralTrend = [...trendMap.entries()].map(([date, count]) => ({ date, count }));

  const centerDistribution = Object.entries(referrals.reduce((acc, r) => {
    const name = r.referring_center_name || 'Unknown';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {})).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);

  const urgencyDistribution = Object.entries(referrals.reduce((acc, r) => {
    acc[r.clinical_urgency] = (acc[r.clinical_urgency] || 0) + 1;
    return acc;
  }, {})).map(([clinical_urgency, count]) => ({ clinical_urgency, count })).sort((a, b) => b.count - a.count);

  const classified = (p) => p.is_senior || p.is_pregnant || p.is_pwd || p.is_child || p.is_infant || p.is_indigenous || p.is_solo_parent;
  const demographicDistribution = {
    seniors: patients.filter((p) => p.is_senior).length,
    pregnant: patients.filter((p) => p.is_pregnant).length,
    pwd: patients.filter((p) => p.is_pwd).length,
    child: patients.filter((p) => p.is_child).length,
    infant: patients.filter((p) => p.is_infant).length,
    indigenous: patients.filter((p) => p.is_indigenous).length,
    soloParent: patients.filter((p) => p.is_solo_parent).length,
    standard: patients.filter((p) => !classified(p)).length,
  };

  const perfMap = new Map();
  for (const row of perf) {
    const entry = perfMap.get(row.operation) || { operation: row.operation, total: 0, count: 0, max_ms: 0 };
    entry.total += row.duration_ms;
    entry.count += 1;
    entry.max_ms = Math.max(entry.max_ms, row.duration_ms);
    perfMap.set(row.operation, entry);
  }
  const latencyMetrics = [...perfMap.values()].map((entry) => ({
    operation: entry.operation,
    average_ms: Math.round((entry.total / entry.count) * 100) / 100,
    max_ms: entry.max_ms,
  })).sort((a, b) => a.operation.localeCompare(b.operation));

  const completedReferrals = referrals.filter((r) => r.status === 'completed');
  const missedReferrals = referrals.filter((r) => r.status === 'missed');
  const queuedOrDone = referrals.filter((r) => ['queued', 'completed', 'missed', 'archived', 'expired'].includes(r.status));
  const servedQueue = (servedQueueRows || []).filter((q) => q.served_at && q.created_at);
  const avgWaitMinutes = servedQueue.length
    ? Math.round(
      (servedQueue.reduce((sum, q) => {
        const wait = (new Date(q.served_at) - new Date(q.created_at)) / 60000;
        return sum + (Number.isFinite(wait) && wait >= 0 ? wait : 0);
      }, 0) / servedQueue.length) * 10,
    ) / 10
    : 0;
  const smsSent = smsLogs.filter((s) => s.status === 'sent').length;
  const smsFailed = smsLogs.filter((s) => s.status === 'failed').length;
  const smsAttempts = smsSent + smsFailed;
  const smsSuccessRate = smsAttempts ? Math.round((smsSent / smsAttempts) * 100) : 0;
  const completionRate = referrals.length
    ? Math.round((completedReferrals.length / referrals.length) * 100)
    : 0;
  const missedRate = queuedOrDone.length
    ? Math.round((missedReferrals.length / queuedOrDone.length) * 100)
    : 0;

  const performanceMetrics = [
    {
      operation: 'completion_rate',
      value: `${completionRate}%`,
      detail: `${completedReferrals.length} of ${referrals.length} referrals completed`,
    },
    {
      operation: 'average_wait_time',
      value: `${avgWaitMinutes} min`,
      detail: servedQueue.length ? `Based on ${servedQueue.length} served queue entries` : 'No served queue samples yet',
    },
    {
      operation: 'missed_visit_rate',
      value: `${missedRate}%`,
      detail: `${missedReferrals.length} missed of ${queuedOrDone.length} queued visits`,
    },
    {
      operation: 'sms_delivery_success',
      value: `${smsSuccessRate}%`,
      detail: smsAttempts ? `${smsSent} sent / ${smsFailed} failed` : 'No SMS attempts logged yet',
    },
    {
      operation: 'pending_review_load',
      value: String(operationalCounts.pending_review || 0),
      detail: 'Referrals awaiting city staff review',
    },
    {
      operation: 'waiting_queue_load',
      value: String(operationalCounts.waiting_queue || 0),
      detail: 'Patients currently waiting in today\'s queue',
    },
    ...latencyMetrics.slice(0, 4).map((row) => ({
      operation: row.operation,
      value: `${row.average_ms} ms`,
      detail: `API latency · max ${row.max_ms} ms`,
      average_ms: row.average_ms,
      max_ms: row.max_ms,
    })),
  ];

  return {
    referralCounts,
    queueCounts,
    smsCounts,
    patientCount: patients.length,
    operationalCounts,
    referralTrend,
    centerDistribution,
    urgencyDistribution,
    demographicDistribution,
    performanceMetrics,
    data_source: 'supabase',
    totals: {
      referrals: referrals.length,
      patients: patients.length,
      sms_logs: smsLogs.length,
      served_queue_samples: (servedQueueRows || []).length,
    },
  };
}

export async function getAnalyticsSummary() {
  const [referrals, queue, smsLogs, perf, users] = await Promise.all([
    select(`SELECT * FROM ${TABLES.referrals}`),
    select(`SELECT * FROM ${TABLES.queueEntries}`),
    select(`SELECT * FROM ${TABLES.smsLogs}`),
    select(`SELECT * FROM ${TABLES.performanceMetrics}`),
    getUserMap(),
  ]);
  const centerMap = await getHealthCenterMap();

  const referralsByStatus = Object.entries(referrals.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {})).map(([status, count]) => ({ status, count }));

  const referralsByCenter = Object.entries(referrals.reduce((acc, r) => {
    const name = centerMap.get(Number(r.referring_health_center_id))?.name || 'Unknown';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {})).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  const queueByPriority = Object.entries(queue.reduce((acc, q) => {
    acc[q.priority_level] = (acc[q.priority_level] || 0) + 1;
    return acc;
  }, {})).map(([priority_level, count]) => ({ priority_level, count }));

  const completion = {
    completed: referrals.filter((r) => r.status === 'completed').length,
    missed: referrals.filter((r) => r.status === 'missed').length,
    total: referrals.length,
  };

  const smsDelivery = Object.entries(smsLogs.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {})).map(([status, count]) => ({ status, count }));

  const averageWaitTime = Object.entries(queue.reduce((acc, q) => {
    if (!q.served_at || !q.created_at) return acc;
    const minutes = (new Date(q.served_at) - new Date(q.created_at)) / 60000;
    const key = q.priority_level;
    acc[key] = acc[key] || { total: 0, count: 0 };
    acc[key].total += minutes;
    acc[key].count += 1;
    return acc;
  }, {})).map(([priority_level, entry]) => ({
    priority_level,
    average_wait_minutes: Math.round((entry.total / entry.count) * 10) / 10,
  }));

  const peakHours = Object.entries(referrals.reduce((acc, r) => {
    const hour = new Date(r.created_at).getHours();
    const label = `${String(hour).padStart(2, '0')}:00`;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {})).map(([hour, count]) => ({ hour, count })).sort((a, b) => b.count - a.count);

  const staffPerformance = Object.entries(referrals.reduce((acc, r) => {
    if (!r.reviewed_by_user_id) return acc;
    const name = users.get(Number(r.reviewed_by_user_id))?.name || `User ${r.reviewed_by_user_id}`;
    acc[name] = acc[name] || { reviewed: 0, approved: 0, rejected: 0 };
    acc[name].reviewed += 1;
    if (['queued', 'completed', 'missed', 'archived'].includes(r.status)) acc[name].approved += 1;
    if (r.status === 'rejected') acc[name].rejected += 1;
    return acc;
  }, {})).map(([staff_name, stats]) => ({ staff_name, ...stats }));

  const totalAssigned = queue.length;
  const abandoned = queue.filter((q) => ['missed', 'cancelled', 'expired'].includes(q.queue_status)).length;
  const queueAbandonmentRate = totalAssigned
    ? [{ label: 'abandonment_rate', rate_percent: Math.round((abandoned / totalAssigned) * 1000) / 10 }]
    : [{ label: 'abandonment_rate', rate_percent: 0 }];

  const dailyVolumes = referrals.reduce((acc, r) => {
    const day = String(r.created_at).slice(0, 10);
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});
  const recentDays = Object.entries(dailyVolumes).sort((a, b) => a[0].localeCompare(b[0])).slice(-7);
  const avgDaily = recentDays.length
    ? recentDays.reduce((sum, [, count]) => sum + count, 0) / recentDays.length
    : 0;
  const volumeForecast = [{
    label: 'next_7_days_estimated',
    estimated_referrals: Math.round(avgDaily * 7),
    daily_average: Math.round(avgDaily * 10) / 10,
  }];

  const perfMap = new Map();
  for (const row of perf) {
    const entry = perfMap.get(row.operation) || {
      operation: row.operation,
      total: 0,
      count: 0,
      max_ms: 0,
      samples: 0,
    };
    entry.total += row.duration_ms;
    entry.count += 1;
    entry.samples += 1;
    entry.max_ms = Math.max(entry.max_ms, row.duration_ms);
    perfMap.set(row.operation, entry);
  }
  const performance = [...perfMap.values()].map((entry) => ({
    operation: entry.operation,
    samples: entry.samples,
    average_ms: Math.round((entry.total / entry.count) * 100) / 100,
    max_ms: entry.max_ms,
  }));

  return {
    referralsByStatus,
    referralsByCenter,
    queueByPriority,
    priorities: queueByPriority,
    completion,
    smsDelivery,
    sms: smsLogs.reduce((acc, s) => {
      const key = `${s.status}|${s.trigger_type}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    averageWaitTime,
    peakHours,
    staffPerformance,
    queueAbandonmentRate,
    volumeForecast,
    performance,
  };
}

export async function listEmailLogs(limit = 200) {
  return (await select(`SELECT * FROM ${TABLES.emailLogs}`))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

export async function computeQueuePosition(referralId) {
  const referral = await getReferral(referralId);
  if (!referral?.queue_number) return null;

  const today = todayDateString();
  const entries = await select(
    `SELECT * FROM ${TABLES.queueEntries} WHERE queue_date = $1 AND queue_status IN ('waiting', 'called') ORDER BY priority_score DESC, created_at ASC`,
    [today],
  );

  const index = entries.findIndex((e) => Number(e.referral_id) === Number(referralId));
  return index >= 0 ? index + 1 : null;
}

export async function exportReferralsRows() {
  return listReferrals({});
}

export async function exportPatientsRows() {
  const [patients, centerMap] = await Promise.all([listPatients({}), getHealthCenterMap()]);
  return patients.map((p) => ({
    id: p.id,
    patient_name: `${p.first_name} ${p.last_name}`,
    birth_date: p.birth_date,
    sex: p.sex,
    contact_number: p.contact_number,
    address: p.address,
    is_senior: p.is_senior,
    is_pregnant: p.is_pregnant,
    is_pwd: p.is_pwd,
    is_child: p.is_child,
    is_infant: p.is_infant,
    is_indigenous: p.is_indigenous,
    is_solo_parent: p.is_solo_parent,
    health_center: centerMap.get(Number(p.health_center_id))?.name,
    created_at: p.created_at,
  }));
}

export async function exportQueueRows() {
  const [queue, patients] = await Promise.all([
    select(`SELECT * FROM ${TABLES.queueEntries}`),
    select(`SELECT * FROM ${TABLES.patients}`),
  ]);
  const patientMap = new Map(patients.map((p) => [p.id, p]));

  return queue
    .map((q) => ({
      ...q,
      patient_name: patientMap.get(q.patient_id)
        ? `${patientMap.get(q.patient_id).first_name} ${patientMap.get(q.patient_id).last_name}`
        : '',
    }))
    .sort((a, b) => `${b.queue_date}${b.created_at}`.localeCompare(`${a.queue_date}${a.created_at}`));
}

export async function exportSmsRows() {
  return listSmsLogs(1000);
}

export async function findReferralsNeedingReminder() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const referrals = await select(`SELECT * FROM ${TABLES.referrals}`);
  const results = [];

  for (const referral of referrals) {
    if (referral.status !== 'queued' || !referral.appointment_at) continue;
    const appt = new Date(referral.appointment_at);
    if (appt < windowStart || appt > windowEnd) continue;

    const bookedAt = new Date(referral.created_at);
    const hoursUntilAppt = (appt.getTime() - bookedAt.getTime()) / (1000 * 60 * 60);
    if (hoursUntilAppt < 36) continue;

    const patient = await getPatient(referral.patient_id);
    const queue = await getQueueEntryByReferral(referral.id);
    const needsSms = patient?.contact_number && !(await hasSmsReminder(referral.id));
    const needsEmail = patient?.email && !(await hasEmailReminder(referral.id));
    if (!needsSms && !needsEmail) continue;

    results.push({
      referral_id: referral.id,
      referral_code: referral.referral_code,
      appointment_at: referral.appointment_at,
      patient_id: patient.id,
      first_name: patient.first_name,
      last_name: patient.last_name,
      contact_number: patient.contact_number,
      email: patient.email,
      queue_entry_id: queue?.id || null,
      queue_number: queue?.queue_number || null,
    });
    if (results.length >= 50) break;
  }

  return results;
}

function resolvePublicTrackingStatus(referral) {
  if (referral.status === 'archived') {
    return {
      display_status: 'cancelled',
      is_cancelled: true,
      is_expired: false,
      status_message: 'This referral was cancelled. Please contact your barangay health center if you need a new referral.',
      status_subtitle: 'This referral was cancelled',
      queue_label: 'Cancelled',
    };
  }

  if (referral.status === 'rejected') {
    const reason = referral.rejection_reason ? ` Reason: ${referral.rejection_reason}` : '';
    return {
      display_status: 'rejected',
      is_cancelled: false,
      is_expired: false,
      status_message: `This referral was rejected.${reason}`,
      status_subtitle: 'This referral was rejected',
      queue_label: 'Not valid',
    };
  }

  if (referral.status === 'completed') {
    return {
      display_status: 'completed',
      is_cancelled: false,
      is_expired: false,
      status_message: null,
      status_subtitle: 'Referral completed',
      queue_label: referral.queue_number || 'Completed',
    };
  }

  const isExpired = referral.status === 'expired'
    || (referral.status === 'queued' && referral.queue_date && isQueueDateExpired(toDateString(referral.queue_date)));

  if (isExpired) {
    return {
      display_status: 'expired',
      is_cancelled: false,
      is_expired: true,
      status_message: 'This queue has expired. The queue date has passed. Please contact your barangay health center for a new referral.',
      status_subtitle: 'This queue has expired',
      queue_label: 'Queue expired',
    };
  }

  return {
    display_status: referral.status,
    is_cancelled: false,
    is_expired: false,
    status_message: null,
    status_subtitle: 'Referral found — details below',
    queue_label: referral.queue_number || 'Not assigned',
  };
}

export async function getPublicTracking(code) {
  const referral = await findReferralByCode(code);
  if (!referral) return null;

  const presentation = resolvePublicTrackingStatus(referral);
  const queuePosition = referral.status === 'queued'
    ? await computeQueuePosition(referral.id)
    : null;

  return {
    referral_code: referral.referral_code,
    tracking_code: referral.referral_code,
    status: presentation.display_status,
    referral_status: referral.status,
    display_status: presentation.display_status,
    is_cancelled: presentation.is_cancelled,
    is_expired: presentation.is_expired,
    status_message: presentation.status_message,
    status_subtitle: presentation.status_subtitle,
    queue_expired_message: presentation.is_expired ? presentation.status_message : null,
    appointment_at: referral.appointment_at,
    appointment_time: referral.appointment_at,
    rejection_reason: referral.rejection_reason,
    patient_name: `${referral.first_name || ''} ${referral.last_name || ''}`.trim(),
    receiving_center_name: referral.receiving_center_name,
    queue_number: presentation.queue_label,
    queue_position: queuePosition,
    priority_level: referral.priority_level,
    priority_score: referral.priority_score,
    queue_status: presentation.is_expired ? 'expired' : (presentation.is_cancelled ? 'cancelled' : referral.queue_status),
    queue_date: referral.queue_date,
  };
}

/** Anonymous public board of everyone currently in the active queue. */
export async function getPublicActiveQueueBoard() {
  const { queue } = await listQueueEntries({ range: 'active' });
  const today = todayDateString();

  const activeRows = queue.filter((entry) => entry.referral_status === 'queued'
    && ['waiting', 'called'].includes(entry.queue_status));

  const byDate = new Map();
  for (const entry of activeRows) {
    const dateKey = queueDateKey(entry.queue_date) || today;
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(entry);
  }

  const entries = [];

  for (const [queueDate, rows] of byDate.entries()) {
    const sorted = [...rows].sort((a, b) => sortByPriority(a, b));
    sorted.forEach((entry, index) => {
      entries.push({
        queue_date: queueDate,
        queue_position: index + 1,
        queue_number: entry.queue_number,
        queue_status: entry.queue_status,
        priority_level: entry.priority_level,
        anonymous_name: anonymizePatientLabel(entry.first_name, entry.last_name),
        receiving_center_name: entry.receiving_center_name || null,
        checkup_location: entry.checkup_location || entry.receiving_center_name || null,
        checkup_barangay: entry.checkup_barangay || null,
      });
    });
  }

  entries.sort((a, b) => {
    const dateCmp = String(b.queue_date).localeCompare(String(a.queue_date));
    if (dateCmp !== 0) return dateCmp;
    return a.queue_position - b.queue_position;
  });

  return {
    queue_date: today,
    updated_at: new Date().toISOString(),
    total: entries.length,
    entries,
  };
}

function rankCounter(counter, total, limit = 10) {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .filter(([label]) => label)
    .map(([label, count]) => ({
      label,
      count,
      share_percent: total ? Math.round((count / total) * 1000) / 10 : 0,
    }));
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function extractReasonThemes(reasons, limit = 8) {
  const stopwords = new Set([
    'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'with',
    'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that', 'from', 'by',
    'as', 'it', 'patient', 'referral', 'check', 'follow', 'up', 'due', 'needs',
  ]);
  const counter = new Map();
  for (const reason of reasons) {
    const words = String(reason).toLowerCase().match(/[a-zA-Z]{3,}/g) || [];
    for (const word of words) {
      if (stopwords.has(word)) continue;
      counter.set(word, (counter.get(word) || 0) + 1);
    }
  }
  const total = [...counter.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([theme, mentions]) => ({
      theme,
      mentions,
      share_percent: Math.round((mentions / total) * 1000) / 10,
    }));
}

function normalizeCityName(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Unknown city';
  const compact = raw.replace(/\s+/g, ' ').trim().toLowerCase();
  // CareLink operates in Koronadal City — merge naming variants.
  if (
    compact === 'koronadal'
    || compact === 'koronadal city'
    || compact === 'city of koronadal'
    || compact === 'koronadal city, south cotabato'
    || compact.startsWith('koronadal')
  ) {
    return 'Koronadal City';
  }
  return raw;
}

/** Live case intelligence from Supabase Postgres (same DB as CareLink). days=0 means all rows. */
export async function getAiCaseInsights({ days = 0, overloadZ = 1 } = {}) {
  const z = Number.isFinite(overloadZ) ? Math.min(Math.max(overloadZ, 0.5), 3) : 1;
  const useWindow = Number.isFinite(days) && days > 0;
  const windowDays = useWindow ? Math.min(Math.max(Math.floor(days), 1), 3650) : 0;

  const rows = useWindow
    ? await select(
      `SELECT
         r.id,
         r.referral_reason,
         r.clinical_urgency,
         r.referral_type,
         r.severity_level,
         r.status,
         r.created_at,
         p.city AS patient_city,
         hc_from.name AS referring_center,
         hc_to.name AS receiving_center
       FROM ${TABLES.referrals} r
       JOIN ${TABLES.patients} p ON p.id = r.patient_id
       JOIN ${TABLES.healthCenters} hc_from ON hc_from.id = r.referring_health_center_id
       JOIN ${TABLES.healthCenters} hc_to ON hc_to.id = r.receiving_health_center_id
       WHERE r.created_at >= NOW() - ($1 * INTERVAL '1 day')
       ORDER BY r.created_at DESC`,
      [windowDays],
    )
    : await select(
      `SELECT
         r.id,
         r.referral_reason,
         r.clinical_urgency,
         r.referral_type,
         r.severity_level,
         r.status,
         r.created_at,
         p.city AS patient_city,
         hc_from.name AS referring_center,
         hc_to.name AS receiving_center
       FROM ${TABLES.referrals} r
       JOIN ${TABLES.patients} p ON p.id = r.patient_id
       JOIN ${TABLES.healthCenters} hc_from ON hc_from.id = r.referring_health_center_id
       JOIN ${TABLES.healthCenters} hc_to ON hc_to.id = r.receiving_health_center_id
       ORDER BY r.created_at DESC`,
    );

  const total = rows.length;
  const byReferring = new Map();
  const byReceiving = new Map();
  const byCity = new Map();
  const byBarangay = new Map();
  const byType = new Map();
  const byUrgency = new Map();
  const bySeverity = new Map();
  const reasons = [];

  const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);

  for (const row of rows) {
    const referring = row.referring_center || 'Unknown barangay';
    const receiving = row.receiving_center || 'Unknown city center';
    const city = normalizeCityName(row.patient_city);
    bump(byReferring, referring);
    bump(byReceiving, receiving);
    bump(byCity, city);
    bump(byBarangay, referring);
    bump(byType, String(row.referral_type || 'unknown'));
    bump(byUrgency, String(row.clinical_urgency || 'unknown'));
    bump(bySeverity, String(row.severity_level || 'unknown'));
    if (row.referral_reason) reasons.push(String(row.referral_reason));
  }

  const referringCounts = [...byReferring.values()];
  const receivingCounts = [...byReceiving.values()];
  const referringMean = mean(referringCounts);
  const referringStd = stdev(referringCounts);
  const receivingMean = mean(receivingCounts);
  const receivingStd = stdev(receivingCounts);

  const overloadedPlaces = [];
  for (const [place, count] of byReferring.entries()) {
    const threshold = referringMean + (z * referringStd);
    if (count >= Math.max(threshold, referringMean ? referringMean * 1.5 : 1)) {
      overloadedPlaces.push({
        place,
        place_type: 'barangay',
        request_count: count,
        share_percent: total ? Math.round((count / total) * 1000) / 10 : 0,
        baseline_average: Math.round(referringMean * 10) / 10,
        overload_score: Math.round((count / (referringMean || 1)) * 100) / 100,
        reason: 'Above-average referral volume from this barangay',
      });
    }
  }
  for (const [place, count] of byReceiving.entries()) {
    const threshold = receivingMean + (z * receivingStd);
    if (count >= Math.max(threshold, receivingMean ? receivingMean * 1.35 : 1)) {
      overloadedPlaces.push({
        place,
        place_type: 'city_center',
        request_count: count,
        share_percent: total ? Math.round((count / total) * 1000) / 10 : 0,
        baseline_average: Math.round(receivingMean * 10) / 10,
        overload_score: Math.round((count / (receivingMean || 1)) * 100) / 100,
        reason: 'Receiving too many referral requests relative to other centers',
      });
    }
  }
  overloadedPlaces.sort((a, b) => b.request_count - a.request_count);

  const hotspots = {
    by_barangay: rankCounter(byBarangay, total),
    by_city: rankCounter(byCity, total),
    by_referring_center: rankCounter(byReferring, total),
    by_receiving_center: rankCounter(byReceiving, total),
  };
  const mostCases = {
    by_referral_type: rankCounter(byType, total),
    by_clinical_urgency: rankCounter(byUrgency, total),
    by_severity: rankCounter(bySeverity, total),
    reason_themes: extractReasonThemes(reasons),
  };

  const topPlace = hotspots.by_barangay[0]?.label || 'N/A';
  const topCase = mostCases.by_referral_type[0]?.label || 'N/A';
  const topUrgency = mostCases.by_clinical_urgency[0]?.label || 'N/A';
  const overloadNames = overloadedPlaces.slice(0, 3).map((row) => row.place);

  const narrative = [
    `Across ${total} referral cases, the highest case concentration is in ${topPlace}.`,
    `The most common case type is ${String(topCase).replaceAll('_', ' ')} with ${topUrgency} clinical urgency dominating volume.`,
  ];
  if (overloadNames.length) {
    narrative.push(`Places with too many requests: ${overloadNames.join(', ')}.`);
  } else {
    narrative.push('No place currently exceeds the overload threshold.');
  }
  if (mostCases.reason_themes.length) {
    narrative.push(
      `Frequent case themes in referral reasons: ${mostCases.reason_themes.slice(0, 5).map((row) => row.theme).join(', ')}.`,
    );
  }

  const recommendations = [];
  if (hotspots.by_barangay[0]) {
    const top = hotspots.by_barangay[0];
    recommendations.push(
      `Prioritize outreach and staffing support for ${top.label} (${top.count} cases, ${top.share_percent}% of volume).`,
    );
  }
  for (const place of overloadedPlaces.slice(0, 2)) {
    recommendations.push(
      `Throttle or redistribute load from ${place.place} (${place.request_count} requests, overload score ${place.overload_score}x).`,
    );
  }
  if (mostCases.by_clinical_urgency[0]) {
    const urgency = mostCases.by_clinical_urgency[0];
    recommendations.push(
      `Prepare protocols for ${urgency.label} cases — currently ${urgency.share_percent}% of referrals.`,
    );
  }
  if (mostCases.reason_themes[0]) {
    recommendations.push(`Review care pathways related to recurring theme: ${mostCases.reason_themes[0].theme}.`);
  }

  return {
    generated_at: new Date().toISOString(),
    model: 'carelink-case-intelligence-v1',
    runtime: 'supabase-postgres',
    source: 'database',
    data_source: 'supabase',
    window_days: useWindow ? windowDays : null,
    scope: useWindow ? `last_${windowDays}_days` : 'all_referrals',
    total_cases: total,
    summary: narrative.join(' '),
    hotspots,
    overloaded_places: overloadedPlaces,
    most_cases: mostCases,
    recommendations: recommendations.length
      ? recommendations
      : ['Not enough referral data yet for actionable AI recommendations.'],
  };
}
