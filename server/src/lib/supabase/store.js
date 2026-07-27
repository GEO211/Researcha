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
  evaluationResponses: 'evaluation_responses',
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

async function applyReferralExpiry(referral, queue) {
  if (!EXPIRABLE_REFERRAL_STATUSES.includes(referral.status) || !queue?.queue_date) {
    return { referral, queue };
  }

  const queueDate = toDateString(queue.queue_date);
  if (!isQueueDateExpired(queueDate)) {
    return { referral, queue };
  }

  const ts = nowIso();
  await query(
    `UPDATE ${TABLES.referrals} SET status = 'expired', updated_at = $1 WHERE id = $2`,
    [ts, referral.id],
  );

  let nextQueue = queue;
  if (queue?.id) {
    await query(
      `UPDATE ${TABLES.queueEntries} SET queue_status = 'expired', updated_at = $1 WHERE id = $2`,
      [ts, queue.id],
    );
    nextQueue = { ...queue, queue_status: 'expired', updated_at: ts };
  }

  return {
    referral: { ...referral, status: 'expired', updated_at: ts },
    queue: nextQueue,
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

  const expired = await applyReferralExpiry(referral, queue);
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
    email: patient?.email,
    referring_center_name: fromCenter?.name,
    receiving_center_name: toCenter?.name,
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

export async function listHealthCenters() {
  const rows = await select(`SELECT * FROM ${TABLES.healthCenters}`);
  return rows.sort((a, b) => `${a.type}${a.name}`.localeCompare(`${b.type}${b.name}`));
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

export async function getPatient(id) {
  return getRowById(TABLES.patients, id);
}

export async function createPatient(data) {
  const ts = nowIso();
  return insertRow(TABLES.patients, { ...data, created_at: ts, updated_at: ts });
}

export async function updatePatient(id, data) {
  await updateRowById(TABLES.patients, id, { ...data, updated_at: nowIso() });
  return getPatient(id);
}

export async function listReferrals(filters = {}) {
  const [referrals, patients, centers, queues] = await Promise.all([
    select(`SELECT * FROM ${TABLES.referrals}`),
    select(`SELECT * FROM ${TABLES.patients}`),
    select(`SELECT * FROM ${TABLES.healthCenters}`),
    select(`SELECT * FROM ${TABLES.queueEntries}`),
  ]);

  const patientMap = new Map(patients.map((p) => [Number(p.id), p]));
  const centerMap = new Map(centers.map((c) => [Number(c.id), c]));
  const queueMap = new Map(queues.map((q) => [Number(q.referral_id), q]));

  let rows = referrals;
  if (filters.healthCenterId) {
    rows = rows.filter((r) => r.referring_health_center_id === filters.healthCenterId);
  }
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

  rows = await Promise.all(rows.map((r) => enrichReferral(r, { patientMap, centerMap, queueMap })));
  if (filters.status) rows = rows.filter((r) => r.status === filters.status);
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);
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

export async function listTodayQueue() {
  const today = todayDateString();
  const [queues, referrals, patients, centers] = await Promise.all([
    select(`SELECT * FROM ${TABLES.queueEntries} WHERE queue_date = $1`, [today]),
    select(`SELECT * FROM ${TABLES.referrals}`),
    select(`SELECT * FROM ${TABLES.patients}`),
    select(`SELECT * FROM ${TABLES.healthCenters}`),
  ]);

  const referralMap = new Map(referrals.map((r) => [Number(r.id), r]));
  const patientMap = new Map(patients.map((p) => [Number(p.id), p]));
  const centerMap = new Map(centers.map((c) => [Number(c.id), c]));

  return queues
    .map((entry) => {
      const referral = referralMap.get(Number(entry.referral_id));
      const patient = patientMap.get(Number(entry.patient_id));
      const center = referral ? centerMap.get(Number(referral.referring_health_center_id)) : null;
      return {
        ...entry,
        status: entry.queue_status,
        queue_status: entry.queue_status,
        tracking_code: referral?.referral_code || null,
        referral_code: referral?.referral_code,
        referral_status: referral?.status,
        patient_name: patient ? `${patient.first_name} ${patient.last_name}`.trim() : null,
        first_name: patient?.first_name,
        last_name: patient?.last_name,
        contact_number: patient?.contact_number,
        referring_center_name: center?.name,
      };
    })
    .filter((entry) => !['cancelled', 'expired'].includes(entry.queue_status)
      && entry.referral_status !== 'archived'
      && entry.referral_status !== 'expired')
    .sort(sortByPriority);
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

export async function createEvaluationResponse(data) {
  const row = await insertRow(TABLES.evaluationResponses, { ...data, created_at: nowIso() });
  return row.id;
}

export async function listEvaluationSummary() {
  const rows = await select(`SELECT * FROM ${TABLES.evaluationResponses}`);
  const map = new Map();

  for (const row of rows) {
    const key = `${row.survey_type}:${row.respondent_role}`;
    const entry = map.get(key) || {
      survey_type: row.survey_type,
      respondent_role: row.respondent_role,
      count: 0,
      total: 0,
    };
    entry.count += 1;
    entry.total += row.score;
    map.set(key, entry);
  }

  return [...map.values()]
    .map((entry) => ({
      survey_type: entry.survey_type,
      respondent_role: entry.respondent_role,
      count: entry.count,
      average_score: Math.round((entry.total / entry.count) * 100) / 100,
    }))
    .sort((a, b) => `${a.survey_type}${a.respondent_role}`.localeCompare(`${b.survey_type}${b.respondent_role}`));
}

export async function listRecentEvaluations(limit = 100) {
  return (await select(`SELECT * FROM ${TABLES.evaluationResponses}`))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)
    .map(({ id, survey_type, respondent_role, respondent_name, tracking_code, rating, score, comments, created_at }) => ({
      id,
      survey_type,
      respondent_role,
      respondent_name,
      tracking_code,
      rating: rating || score,
      score,
      comments,
      created_at,
    }));
}

export async function listPatientSatisfactionSummary() {
  const rows = await select(
    `SELECT * FROM ${TABLES.evaluationResponses} WHERE survey_type = 'patient_satisfaction' OR rating IS NOT NULL`,
  );
  if (!rows.length) return { total: 0, average_rating: 0 };
  const total = rows.length;
  const average_rating = Math.round((rows.reduce((sum, r) => sum + (r.rating || r.score), 0) / total) * 10) / 10;
  return { total, average_rating };
}

export async function getDashboardSummary(user) {
  const roleFilter = user.role === 'barangay_staff' ? user.health_center_id : null;
  const [referrals, patients, queue, smsLogs, perf] = await Promise.all([
    listReferrals(roleFilter ? { healthCenterId: roleFilter } : {}),
    listPatients(roleFilter ? { healthCenterId: roleFilter } : {}),
    listTodayQueue(),
    listSmsLogs(500),
    select(`SELECT * FROM ${TABLES.performanceMetrics}`),
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

  const demographicDistribution = {
    seniors: patients.filter((p) => p.is_senior).length,
    pregnant: patients.filter((p) => p.is_pregnant).length,
    pwd: patients.filter((p) => p.is_pwd).length,
    standard: patients.filter((p) => !p.is_senior && !p.is_pregnant && !p.is_pwd).length,
  };

  const perfMap = new Map();
  for (const row of perf) {
    const entry = perfMap.get(row.operation) || { operation: row.operation, total: 0, count: 0, max_ms: 0 };
    entry.total += row.duration_ms;
    entry.count += 1;
    entry.max_ms = Math.max(entry.max_ms, row.duration_ms);
    perfMap.set(row.operation, entry);
  }
  const performanceMetrics = [...perfMap.values()].map((entry) => ({
    operation: entry.operation,
    average_ms: Math.round((entry.total / entry.count) * 100) / 100,
    max_ms: entry.max_ms,
  })).sort((a, b) => a.operation.localeCompare(b.operation));

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
  };
}

export async function getAnalyticsSummary() {
  const [referrals, queue, smsLogs, perf, evaluations, users] = await Promise.all([
    select(`SELECT * FROM ${TABLES.referrals}`),
    select(`SELECT * FROM ${TABLES.queueEntries}`),
    select(`SELECT * FROM ${TABLES.smsLogs}`),
    select(`SELECT * FROM ${TABLES.performanceMetrics}`),
    select(`SELECT * FROM ${TABLES.evaluationResponses}`),
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

  const satisfactionTrends = evaluations
    .filter((e) => e.survey_type === 'patient_satisfaction' || e.rating)
    .reduce((acc, e) => {
      const day = String(e.created_at).slice(0, 10);
      acc[day] = acc[day] || { total: 0, count: 0 };
      acc[day].total += e.rating || e.score;
      acc[day].count += 1;
      return acc;
    }, {});
  const patientSatisfactionTrends = Object.entries(satisfactionTrends)
    .map(([date, entry]) => ({
      date,
      average_rating: Math.round((entry.total / entry.count) * 10) / 10,
      responses: entry.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

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
    patientSatisfactionTrends,
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
