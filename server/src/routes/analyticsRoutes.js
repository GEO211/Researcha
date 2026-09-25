import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  exportPatientsRows,
  exportQueueRows,
  exportReferralsRows,
  exportSmsRows,
  getAnalyticsSummary,
} from '../lib/supabase/store.js';
import { PERMISSIONS } from '../../../shared/rbac.js';

const router = Router();

function sendCsv(res, filename, rows, fallbackColumns) {
  const columns = Object.keys(rows[0] || fallbackColumns);
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [columns.join(','), ...rows.map((row) => columns.map((column) => escape(row[column])).join(','))].join('\n');

  res.header('Content-Type', 'text/csv');
  res.attachment(filename);
  res.send(csv);
}

router.get('/', authenticate, authorize(PERMISSIONS.ANALYTICS_VIEW), async (_req, res, next) => {
  try {
    const data = await getAnalyticsSummary();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/export/referrals.csv', authenticate, authorize(PERMISSIONS.ANALYTICS_VIEW), async (_req, res, next) => {
  try {
    const rows = await exportReferralsRows();
    sendCsv(res, 'carelink-referrals.csv', rows.map((r) => ({
      referral_code: r.referral_code,
      patient_name: `${r.first_name} ${r.last_name}`,
      referring_center: r.referring_center_name,
      clinical_urgency: r.clinical_urgency,
      referral_type: r.referral_type,
      status: r.status,
      queue_number: r.queue_number,
      priority_level: r.priority_level,
      priority_score: r.priority_score,
      created_at: r.created_at,
      reviewed_at: r.reviewed_at,
      completed_at: r.completed_at,
    })), {
      referral_code: '',
      patient_name: '',
      referring_center: '',
      clinical_urgency: '',
      referral_type: '',
      status: '',
      queue_number: '',
      priority_level: '',
      priority_score: '',
      created_at: '',
      reviewed_at: '',
      completed_at: '',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/export/patients.csv', authenticate, authorize(PERMISSIONS.ANALYTICS_VIEW), async (_req, res, next) => {
  try {
    const rows = await exportPatientsRows();
    sendCsv(res, 'carelink-patients.csv', rows, {
      id: '',
      patient_name: '',
      birth_date: '',
      sex: '',
      contact_number: '',
      address: '',
      is_senior: '',
      is_pregnant: '',
      is_pwd: '',
      is_child: '',
      is_infant: '',
      is_indigenous: '',
      is_solo_parent: '',
      health_center: '',
      created_at: '',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/export/queue.csv', authenticate, authorize(PERMISSIONS.ANALYTICS_VIEW), async (_req, res, next) => {
  try {
    const rows = await exportQueueRows();
    sendCsv(res, 'carelink-queue.csv', rows, {
      queue_date: '',
      queue_number: '',
      patient_name: '',
      priority_level: '',
      priority_score: '',
      queue_status: '',
      called_at: '',
      served_at: '',
      missed_at: '',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/export/sms.csv', authenticate, authorize(PERMISSIONS.ANALYTICS_VIEW), async (_req, res, next) => {
  try {
    const rows = await exportSmsRows();
    sendCsv(res, 'carelink-sms-logs.csv', rows.map((r) => ({
      created_at: r.created_at,
      recipient_number: r.recipient_number,
      trigger_type: r.trigger_type,
      status: r.status,
      error_message: r.error_message,
      referral_code: r.referral_code,
      patient_name: r.first_name ? `${r.first_name} ${r.last_name}` : '',
      message: r.message,
    })), {
      created_at: '',
      recipient_number: '',
      trigger_type: '',
      status: '',
      error_message: '',
      referral_code: '',
      patient_name: '',
      message: '',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
