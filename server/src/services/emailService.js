import nodemailer from 'nodemailer';
import { createEmailLog, getSystemSetting } from '../lib/supabase/store.js';

async function isTriggerEnabled(triggerType) {
  const settingKey = {
    appointment_reminder: 'email.reminder.enabled',
    queue_call: 'email.queue_call.enabled',
  }[triggerType];

  if (!settingKey) return true;

  const row = await getSystemSetting(settingKey);
  return !row || row.setting_value === 'true';
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function logEmail({ patientId, referralId, queueEntryId, recipientEmail, subject, message, triggerType, status, errorMessage = null }) {
  await createEmailLog({
    patient_id: patientId,
    referral_id: referralId,
    queue_entry_id: queueEntryId,
    recipient_email: recipientEmail,
    subject,
    message,
    trigger_type: triggerType,
    status,
    error_message: errorMessage,
    sent_at: status === 'sent' ? new Date().toISOString() : null,
  });
}

export async function sendEmail({ patientId, referralId, queueEntryId = null, recipientEmail, subject, message, triggerType }) {
  if (!recipientEmail) {
    return { status: 'skipped', reason: 'No recipient email available.' };
  }

  const enabled = await isTriggerEnabled(triggerType);
  if (!enabled) {
    await logEmail({
      patientId,
      referralId,
      queueEntryId,
      recipientEmail,
      subject,
      message,
      triggerType,
      status: 'pending',
      errorMessage: 'Trigger disabled.',
    });
    return { status: 'skipped' };
  }

  const transporter = createTransporter();

  if (!transporter) {
    await logEmail({
      patientId,
      referralId,
      queueEntryId,
      recipientEmail,
      subject,
      message,
      triggerType,
      status: 'pending',
      errorMessage: 'SMTP settings not configured.',
    });
    return { status: 'pending' };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipientEmail,
      subject,
      text: message,
    });

    await logEmail({ patientId, referralId, queueEntryId, recipientEmail, subject, message, triggerType, status: 'sent' });
    return { status: 'sent' };
  } catch (error) {
    await logEmail({
      patientId,
      referralId,
      queueEntryId,
      recipientEmail,
      subject,
      message,
      triggerType,
      status: 'failed',
      errorMessage: error.message,
    });
    return { status: 'failed', error: error.message };
  }
}

export function callEmailSubject({ queueNumber }) {
  return `CareLink: You are being called — Queue ${queueNumber}`;
}

export function callEmailMessage({ queueNumber, patientName }) {
  const greeting = patientName ? `Hello ${patientName},\n\n` : '';
  return `${greeting}You are being called at Koronadal City Health Center. Please proceed to the reception desk now.\n\nQueue number: ${queueNumber}\n\n— CareLink`;
}
