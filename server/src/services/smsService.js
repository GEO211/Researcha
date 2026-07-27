import { createSmsLog, getPatient, getSystemSetting, hasSentSms } from '../lib/supabase/store.js';

const UNISMS_URL = 'https://unismsapi.com/api/sms';
const SMS_MAX_LENGTH = 160;
const HEALTH_CENTER_NAME = 'Koronadal City Health Center';
const SMS_BRAND_NAME = process.env.SMS_BRAND_NAME || 'CareLink';
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Manila';
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL || 'https://carelink-bay.vercel.app').replace(/\/$/, '');
const SMS_INCLUDE_LINKS = process.env.SMS_INCLUDE_LINKS !== 'false';
const SMS_DEDUPE_TRIGGERS = new Set([
  'referral_booked',
  'approval',
  'referral_completed',
  'referral_cancelled',
  'appointment_reminder',
]);

const TRACKING_SITE = 'www.carelink-bay.vercel.app';
const TRACKING_SITE_FALLBACK = 'carelink-bay website';

export function buildTrackingUrl(trackingCode) {
  if (!trackingCode) return APP_PUBLIC_URL;
  return `${APP_PUBLIC_URL}/track/${encodeURIComponent(String(trackingCode).trim())}`;
}

function formatPatientName(patientName) {
  return String(patientName || '').trim().replace(/\s+/g, ' ');
}

export function resolvePatientDisplayName(patient) {
  if (!patient) return '';
  if (patient.patient_name) return formatPatientName(patient.patient_name);
  const parts = [patient.first_name, patient.middle_name, patient.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return formatPatientName(parts.join(' '));
}

function buildTrackerSmsBody({
  patientName,
  queueNumber,
  trackingCode,
  siteText = TRACKING_SITE_FALLBACK,
  eventPrefix = '',
}) {
  const name = formatPatientName(patientName) || 'Pending';
  const code = String(queueNumber || '').trim() || 'N/A';
  const tracker = String(trackingCode || '').trim() || 'N/A';
  const brandLead = eventPrefix
    ? `${SMS_BRAND_NAME}: ${eventPrefix}`
    : `${SMS_BRAND_NAME}:`;
  return `${brandLead} Your visit status code is ${code}. Patient name: ${name}. Referral tracker ${tracker}. Check status at ${siteText}.`;
}

function buildTrackerSmsBodyCompact({
  patientName,
  queueNumber,
  trackingCode,
  siteText = TRACKING_SITE_FALLBACK,
  eventPrefix = '',
}) {
  const name = formatPatientName(patientName) || 'Pending';
  const code = String(queueNumber || '').trim() || 'N/A';
  const tracker = String(trackingCode || '').trim() || 'N/A';
  const brandLead = eventPrefix
    ? `${SMS_BRAND_NAME}: ${eventPrefix}`
    : `${SMS_BRAND_NAME}:`;
  return `${brandLead} Your visit status code is ${code}. Patient ${name}. Referral tracker ${tracker}. Check at ${siteText}.`;
}

export async function resolveSmsPatientName(patientId, patientName = null) {
  const fromArgument = formatPatientName(patientName);
  if (fromArgument) return fromArgument;
  if (!patientId) return '';
  const patient = await getPatient(patientId);
  return resolvePatientDisplayName(patient);
}

function injectPatientName(message, displayName) {
  const name = formatPatientName(displayName);
  if (!name || !message) return message;
  return String(message)
    .replace(/Patient name:\s*[^.]+\./i, `Patient name: ${name}.`)
    .replace(/Patient name\s+[^.]+\./i, `Patient name ${name}.`)
    .replace(/Patient\s+[^.]+\.\s+Referral tracker/i, `Patient ${name}. Referral tracker`);
}

function buildSmsPair({ patientName, queueNumber, trackingCode, eventPrefix = '' }) {
  const bodies = [
    buildTrackerSmsBody({ patientName, queueNumber, trackingCode, siteText: TRACKING_SITE_FALLBACK, eventPrefix }),
    buildTrackerSmsBodyCompact({ patientName, queueNumber, trackingCode, siteText: TRACKING_SITE_FALLBACK, eventPrefix }),
  ];

  const primaryBody = bodies.find((body) => body.length <= SMS_MAX_LENGTH) || bodies[bodies.length - 1];
  const resolvedFallback = primaryBody;

  return {
    message: primaryBody.length <= SMS_MAX_LENGTH ? primaryBody : normalizeSmsContent(primaryBody),
    fallbackMessage: resolvedFallback.length <= SMS_MAX_LENGTH ? resolvedFallback : normalizeSmsContent(resolvedFallback),
  };
}

function isContentPolicyError(message) {
  const text = String(message || '');
  return isLinkProhibitedError(text)
    || isSpamError(text)
    || /unacceptable content/i.test(text)
    || /lacks company name/i.test(text)
    || /vague code/i.test(text);
}

function isLinkProhibitedError(message) {
  return /links are prohibited/i.test(String(message || ''));
}

function isSpamError(message) {
  return /rephrase your message/i.test(String(message || ''));
}

function shouldRetryWithFallback(error, content, fallback) {
  return Boolean(fallback && fallback !== content && isContentPolicyError(error.message));
}

function formatSmsDateTime(appointmentAt) {
  if (!appointmentAt) return 'within 24 hours';

  const date = new Date(appointmentAt);
  if (Number.isNaN(date.getTime())) return 'within 24 hours';

  const options = {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    hour12: true,
  };

  if (date.getMinutes() !== 0) {
    options.minute = '2-digit';
  }

  return date.toLocaleString('en-PH', options);
}

function resolveLocation(location) {
  const value = String(location || HEALTH_CENTER_NAME).trim();
  return value || HEALTH_CENTER_NAME;
}

async function isTriggerEnabled(triggerType) {
  const settingKey = {
    approval: 'sms.approval.enabled',
    appointment_reminder: 'sms.reminder.enabled',
    missed_referral: 'sms.missed.enabled',
    queue_call: 'sms.queue_call.enabled',
    referral_completed: 'sms.completion.enabled',
    referral_booked: 'sms.approval.enabled',
    referral_cancelled: 'sms.cancel.enabled',
    referral_rescheduled: 'sms.reschedule.enabled',
  }[triggerType];

  if (!settingKey) return true;

  const row = await getSystemSetting(settingKey);
  return !row || row.setting_value === 'true';
}

export function formatPhilippineNumber(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('63') && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.startsWith('0') && digits.length === 11) {
    return `+63${digits.slice(1)}`;
  }

  if (digits.length === 10 && digits.startsWith('9')) {
    return `+63${digits}`;
  }

  if (digits.length >= 10) {
    return `+${digits}`;
  }

  return null;
}

function extractUniSmsError(payload, status) {
  if (payload?.message?.fail_reason) return String(payload.message.fail_reason);
  if (typeof payload?.error === 'string') return payload.error;
  if (payload?.errors) {
    return Object.entries(payload.errors)
      .flatMap(([field, messages]) => {
        if (Array.isArray(messages)) return messages.map((message) => `${field}: ${message}`);
        return [`${field}: ${messages}`];
      })
      .join('; ');
  }
  if (typeof payload?.message === 'string') return payload.message;
  return `UniSMS returned HTTP ${status}`;
}

function normalizeSmsContent(message) {
  const trimmed = String(message || '').trim();
  if (trimmed.length <= SMS_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, SMS_MAX_LENGTH - 3)}...`;
}

async function resolvePatientForSms(patientId, fallbackNumber = null) {
  if (!patientId) {
    return {
      phone: fallbackNumber || null,
      displayName: '',
    };
  }

  const patient = await getPatient(patientId);
  return {
    phone: patient?.contact_number || fallbackNumber || null,
    displayName: resolvePatientDisplayName(patient),
    patient,
  };
}

export async function logSms({ patientId, referralId, queueEntryId, recipientNumber, message, triggerType, status, errorMessage = null }) {
  await createSmsLog({
    patient_id: patientId,
    referral_id: referralId,
    queue_entry_id: queueEntryId,
    recipient_number: recipientNumber,
    message,
    trigger_type: triggerType,
    status,
    error_message: errorMessage,
    sent_at: status === 'sent' ? new Date().toISOString() : null,
  });
}

async function deliverUniSms({ secretKey, senderId, recipient, content, metadata }) {
  const auth = Buffer.from(`${secretKey}:`).toString('base64');
  const response = await fetch(UNISMS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient,
      content,
      sender_id: senderId,
      metadata,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(extractUniSmsError(payload, response.status));
  }

  const deliveryStatus = payload?.message?.status;
  if (deliveryStatus && !['sent', 'queued', 'pending', 'retrying'].includes(deliveryStatus)) {
    throw new Error(payload?.message?.fail_reason || `UniSMS status: ${deliveryStatus}`);
  }

  return { referenceId: payload?.message?.reference_id || null };
}

function buildLinkFallbackContent(content) {
  return String(content || '')
    .replace(/www\.carelink-bay\.vercel\.app/gi, TRACKING_SITE_FALLBACK)
    .replace(/carelink-bay\.vercel\.app/gi, TRACKING_SITE_FALLBACK)
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function sendSms({ patientId, referralId, queueEntryId = null, recipientNumber = null, message, fallbackMessage = null, triggerType }) {
  const { phone: patientPhone, displayName } = await resolvePatientForSms(patientId, recipientNumber);

  if (!patientPhone) {
    const reason = patientId
      ? 'Patient has no registered contact number.'
      : 'No recipient number available.';
    return { status: 'skipped', reason };
  }

  if (!displayName) {
    return { status: 'failed', error: 'Patient name is required for SMS.', recipient: patientPhone };
  }

  const enabled = await isTriggerEnabled(triggerType);

  if (!enabled) {
    await logSms({ patientId, referralId, queueEntryId, recipientNumber: patientPhone, message, triggerType, status: 'pending', errorMessage: 'Trigger disabled.' });
    return { status: 'skipped', reason: 'SMS trigger disabled.' };
  }

  if (referralId && triggerType && SMS_DEDUPE_TRIGGERS.has(triggerType) && await hasSentSms(referralId, triggerType)) {
    return { status: 'skipped', reason: `SMS already sent for ${triggerType}.`, recipient: patientPhone };
  }

  const secretKey = process.env.UNISMS_SECRET_KEY;
  const senderId = process.env.UNISMS_SENDER_ID || 'Unisoft';
  const recipient = formatPhilippineNumber(patientPhone);
  const content = normalizeSmsContent(injectPatientName(message, displayName));
  const resolvedFallback = fallbackMessage
    ? normalizeSmsContent(injectPatientName(fallbackMessage, displayName))
    : null;

  if (!secretKey) {
    await logSms({ patientId, referralId, queueEntryId, recipientNumber: patientPhone, message: content, triggerType, status: 'pending', errorMessage: 'UniSMS secret key not configured.' });
    return { status: 'pending', reason: 'UniSMS secret key not configured.', recipient: patientPhone };
  }

  if (!recipient) {
    await logSms({ patientId, referralId, queueEntryId, recipientNumber: patientPhone, message: content, triggerType, status: 'failed', errorMessage: 'Invalid Philippine mobile number.' });
    return { status: 'failed', error: 'Invalid Philippine mobile number.', recipient: patientPhone };
  }

  const metadata = {
    trigger_type: triggerType,
    referral_id: referralId ? String(referralId) : undefined,
    patient_id: patientId ? String(patientId) : undefined,
  };

  const sendAttempt = async (body) => deliverUniSms({
    secretKey,
    senderId,
    recipient,
    content: body,
    metadata,
  });

  try {
    const result = await sendAttempt(content);
    await logSms({ patientId, referralId, queueEntryId, recipientNumber: recipient, message: content, triggerType, status: 'sent' });
    return { status: 'sent', referenceId: result.referenceId, recipient: patientPhone };
  } catch (error) {
    const fallback = resolvedFallback
      ? resolvedFallback
      : String(content).includes(TRACKING_SITE)
        ? normalizeSmsContent(content.replace(TRACKING_SITE, TRACKING_SITE_FALLBACK))
        : buildLinkFallbackContent(content);

    if (shouldRetryWithFallback(error, content, fallback)) {
      try {
        const result = await sendAttempt(fallback);
        await logSms({
          patientId,
          referralId,
          queueEntryId,
          recipientNumber: recipient,
          message: fallback,
          triggerType,
          status: 'sent',
          errorMessage: 'Sent fallback message because the tracking site text was blocked by the SMS provider.',
        });
        return {
          status: 'sent',
          referenceId: result.referenceId,
          recipient: patientPhone,
          warning: 'Sent fallback message with carelink-bay website instead of www.carelink-bay.vercel.app.',
        };
      } catch (retryError) {
        await logSms({ patientId, referralId, queueEntryId, recipientNumber: patientPhone, message: fallback, triggerType, status: 'failed', errorMessage: retryError.message });
        return { status: 'failed', error: retryError.message, recipient: patientPhone };
      }
    }

    await logSms({ patientId, referralId, queueEntryId, recipientNumber: patientPhone, message: content, triggerType, status: 'failed', errorMessage: error.message });
    return { status: 'failed', error: error.message, recipient: patientPhone };
  }
}

function trackerMessageOptions({
  patientName = null,
  queueNumber = null,
  trackingCode = null,
  eventPrefix = '',
}) {
  return buildSmsPair({ patientName, queueNumber, trackingCode, eventPrefix });
}

export async function confirmationMessage(options) {
  return (await confirmationMessagePair(options)).message;
}

export async function confirmationMessagePair({
  queueNumber,
  trackingCode = null,
  patientName = null,
  patientId = null,
}) {
  const resolvedName = await resolveSmsPatientName(patientId, patientName);
  return trackerMessageOptions({
    patientName: resolvedName,
    queueNumber,
    trackingCode,
  });
}

export function approvalMessage(options) {
  return trackerMessageOptions({
    patientName: resolvePatientDisplayName(options.patient) || options.patientName,
    queueNumber: options.queueNumber,
    trackingCode: options.trackingCode,
  }).message;
}

export function missedMessage({ appointmentAt = null, trackingCode = null, patientName = null, queueNumber = null } = {}) {
  const schedule = appointmentAt ? formatSmsDateTime(appointmentAt) : 'your visit';
  return trackerMessageOptions({
    patientName,
    queueNumber,
    trackingCode,
    eventPrefix: `Missed appointment update for ${schedule}.`,
  }).message;
}

export function rejectionMessage({ reason, trackingCode = null, patientName = null, queueNumber = null } = {}) {
  const reasonLine = reason ? ` Reason: ${reason}.` : '';
  return trackerMessageOptions({
    patientName,
    queueNumber,
    trackingCode,
    eventPrefix: `Booking not approved.${reasonLine}`,
  }).message;
}

export function callMessage({ queueNumber, patientName, trackingCode = null }) {
  return trackerMessageOptions({
    patientName,
    queueNumber,
    trackingCode,
    eventPrefix: 'Queue update, your turn now.',
  }).message;
}

export function appointmentReminderMessage({
  appointmentAt,
  trackingCode = null,
  queueNumber = null,
  patientName = null,
}) {
  return trackerMessageOptions({
    patientName,
    queueNumber,
    trackingCode,
    eventPrefix: `Appointment reminder for ${formatSmsDateTime(appointmentAt)}.`,
  }).message;
}

export function completionThankYouMessage({ trackingCode = null, patientName = null, queueNumber = null } = {}) {
  return trackerMessageOptions({
    patientName,
    queueNumber,
    trackingCode,
    eventPrefix: 'Thank you for visiting.',
  }).message;
}

export function cancellationMessage({ trackingCode = null, queueNumber = null, patientName = null } = {}) {
  return trackerMessageOptions({
    patientName,
    queueNumber,
    trackingCode,
    eventPrefix: 'Booking canceled.',
  }).message;
}

export function rescheduleMessage({ appointmentAt, trackingCode = null, queueNumber = null, patientName = null } = {}) {
  return trackerMessageOptions({
    patientName,
    queueNumber,
    trackingCode,
    eventPrefix: `Rescheduled to ${formatSmsDateTime(appointmentAt)}.`,
  }).message;
}
