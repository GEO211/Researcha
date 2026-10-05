import { query, queryOne } from './query.js';
import { compareQueuePriority } from '../../../../shared/queuePriority.js';

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Manila';

export function formatDateInAppTimezone(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(date);
}

export function generateDefaultAppointmentAt(from = new Date()) {
  const appointment = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  appointment.setMinutes(0, 0, 0);
  return appointment.toISOString();
}

export function todayDateString() {
  return formatDateInAppTimezone(new Date());
}

/** Shift a YYYY-MM-DD string by N calendar days (timezone-safe via noon UTC). */
export function addDaysToDateString(dateStr, days) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  const dt = new Date(Date.UTC(year, month - 1, day, 12));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return dt.toISOString().slice(0, 10);
}

export function extractReferralCodeDate(referralCode) {
  const match = referralCode?.match(/^CL-(\d{4})(\d{2})(\d{2})-/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function getReferralQueueDate(referral, queue) {
  if (queue?.queue_date) return toDateString(queue.queue_date);
  return extractReferralCodeDate(referral?.referral_code) || toDateString(referral?.created_at);
}

export function isQueueDateExpired(queueDate) {
  if (!queueDate) return false;
  return queueDate < todayDateString();
}

export const EXPIRABLE_REFERRAL_STATUSES = ['queued'];

export const QUEUE_CALL_COOLDOWN_MS = 60_000;

export function queueCallCooldownSeconds(calledAt) {
  if (!calledAt) return 0;
  const calledMs = new Date(calledAt).getTime();
  const remaining = QUEUE_CALL_COOLDOWN_MS - (Date.now() - calledMs);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export function toDateString(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
    return formatDateInAppTimezone(parsed);
  }
  return formatDateInAppTimezone(value instanceof Date ? value : new Date(value));
}

export function sortByPriority(a, b) {
  return compareQueuePriority(a, b);
}

export function matchesSearch(text, q) {
  if (!q) return true;
  return String(text || '').toLowerCase().includes(String(q).toLowerCase());
}

/** Public display label: geodev → g****v, Leo Santiago → l********o */
export function anonymizePatientLabel(firstName, lastName) {
  const compact = `${String(firstName || '').trim()}${String(lastName || '').trim()}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!compact) return '—';
  if (compact.length === 1) return `${compact[0]}*`;
  if (compact.length === 2) return `${compact[0]}*${compact[1]}`;
  return `${compact[0]}${'*'.repeat(compact.length - 2)}${compact[compact.length - 1]}`;
}

export function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export function normalizeAppointmentAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

export async function getHealthCenterName(id) {
  if (!id) return null;
  const row = await queryOne('SELECT name FROM health_centers WHERE id = $1', [id]);
  return row?.name || null;
}

export async function getUserMap() {
  const rows = await query('SELECT * FROM users');
  return new Map(rows.map((row) => [Number(row.id), row]));
}

export async function getHealthCenterMap() {
  const rows = await query('SELECT * FROM health_centers');
  return new Map(rows.map((row) => [Number(row.id), row]));
}

export function buildUpdateClause(data, startIndex = 1) {
  const entries = Object.entries(stripUndefined(data));
  if (!entries.length) return { sql: '', values: [], nextIndex: startIndex };
  const parts = entries.map(([key], index) => `${key} = $${startIndex + index}`);
  return {
    sql: parts.join(', '),
    values: entries.map(([, value]) => value),
    nextIndex: startIndex + entries.length,
  };
}
