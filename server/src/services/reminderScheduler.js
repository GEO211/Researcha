import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import cron from 'node-cron';
import { expirePastQueueEntries, findReferralsNeedingReminder } from '../lib/supabase/store.js';
import { appointmentReminderMessage, resolvePatientDisplayName, sendSms } from './smsService.js';
import { sendEmail } from './emailService.js';
import { refreshScheduledForecasts } from './forecastService.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function runHourlyAi(command = 'analyze') {
  const script = path.join(repoRoot, 'ai', 'hourly_job.py');
  const child = spawn('py', ['-3', script, command], {
    cwd: repoRoot,
    env: process.env,
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  child.on('error', (error) => {
    console.error('[CareLink] Hourly AI failed to start:', error.message);
  });
  child.on('close', (code) => {
    if (code) console.error(`[CareLink] Hourly AI ${command} exited ${code}`);
  });
}

export function startReminderScheduler() {
  runHourlyAi('analyze');
  expirePastQueueEntries().catch((error) => {
    console.error('[CareLink] Queue expiry failed:', error.message);
  });
  refreshScheduledForecasts().catch((error) => {
    console.error('[CareLink] Forecast refresh failed:', error.message);
  });

  cron.schedule('*/5 * * * *', async () => {
    try {
      await expirePastQueueEntries();
    } catch (error) {
      console.error('[CareLink] Queue expiry failed:', error.message);
    }

    const referrals = await findReferralsNeedingReminder();

    for (const referral of referrals) {
      const message = appointmentReminderMessage({
        appointmentAt: referral.appointment_at,
        trackingCode: referral.referral_code,
        queueNumber: referral.queue_number,
        patientName: resolvePatientDisplayName(referral),
      });

      if (referral.contact_number) {
        await sendSms({
          patientId: referral.patient_id,
          referralId: referral.referral_id,
          queueEntryId: referral.queue_entry_id,
          triggerType: 'appointment_reminder',
          message,
        });
      }

      if (referral.email) {
        await sendEmail({
          patientId: referral.patient_id,
          referralId: referral.referral_id,
          queueEntryId: referral.queue_entry_id,
          recipientEmail: referral.email,
          triggerType: 'appointment_reminder',
          subject: 'CareLink appointment reminder',
          message: `Hello ${referral.first_name} ${referral.last_name},\n\n${message}`,
        });
      }
    }
  });

  cron.schedule('5 * * * *', () => {
    runHourlyAi('analyze');
  }, {
    timezone: process.env.APP_TIMEZONE || 'Asia/Manila',
  });

  cron.schedule('20 0 * * *', () => {
    runHourlyAi('train');
  }, {
    timezone: process.env.APP_TIMEZONE || 'Asia/Manila',
  });

  cron.schedule('15 0 * * *', async () => {
    try {
      await refreshScheduledForecasts();
    } catch (error) {
      console.error('[CareLink] Forecast refresh failed:', error.message);
    }
  }, {
    timezone: process.env.APP_TIMEZONE || 'Asia/Manila',
  });
}
