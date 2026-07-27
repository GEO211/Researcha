import cron from 'node-cron';
import { findReferralsNeedingReminder } from '../lib/supabase/store.js';
import { appointmentReminderMessage, resolvePatientDisplayName, sendSms } from './smsService.js';
import { sendEmail } from './emailService.js';

export function startReminderScheduler() {
  cron.schedule('*/5 * * * *', async () => {
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
}
