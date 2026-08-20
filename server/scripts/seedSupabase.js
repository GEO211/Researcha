import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const healthCenters = [
  { id: 1, name: 'Koronadal City Health Center', type: 'city', address: 'Koronadal City, South Cotabato', contact_number: '09170000001', status: 'active' },
  { id: 2, name: 'Barangay Zone I Health Center', type: 'barangay', address: 'Barangay Zone I, Koronadal City', contact_number: '09170000002', status: 'active' },
  { id: 3, name: 'Barangay Sta. Cruz Health Center', type: 'barangay', address: 'Barangay Sta. Cruz, Koronadal City', contact_number: '09170000003', status: 'active' },
];

const users = [
  { id: 1, health_center_id: null, name: 'Super Admin', email: 'admin@carelink.local', password: '$2b$10$YvzSi41A7NYDGB.i9eenMOk8WnLO7/IMkE8BXOpJtFOoynEIL.bjG', role: 'super_admin', status: 'active' },
  { id: 2, health_center_id: 2, name: 'Barangay Staff', email: 'barangay@carelink.local', password: '$2b$10$YvzSi41A7NYDGB.i9eenMOk8WnLO7/IMkE8BXOpJtFOoynEIL.bjG', role: 'barangay_staff', status: 'active' },
  { id: 3, health_center_id: 1, name: 'City Staff', email: 'city@carelink.local', password: '$2b$10$YvzSi41A7NYDGB.i9eenMOk8WnLO7/IMkE8BXOpJtFOoynEIL.bjG', role: 'city_staff', status: 'active' },
];

const priorityRules = [
  { name: 'Emergency clinical urgency', category: 'clinical_urgency', condition_key: 'emergency', score_value: 100, is_active: true },
  { name: 'Urgent clinical urgency', category: 'clinical_urgency', condition_key: 'urgent', score_value: 60, is_active: true },
  { name: 'Routine clinical urgency', category: 'clinical_urgency', condition_key: 'routine', score_value: 20, is_active: true },
  { name: 'Senior citizen', category: 'demographic', condition_key: 'is_senior', score_value: 25, is_active: true },
  { name: 'Pregnant patient', category: 'demographic', condition_key: 'is_pregnant', score_value: 25, is_active: true },
  { name: 'Person with disability', category: 'demographic', condition_key: 'is_pwd', score_value: 25, is_active: true },
  { name: 'Emergency referral type', category: 'referral_type', condition_key: 'emergency', score_value: 50, is_active: true },
  { name: 'Specialist consultation', category: 'referral_type', condition_key: 'specialist_consultation', score_value: 30, is_active: true },
  { name: 'Follow-up referral', category: 'referral_type', condition_key: 'follow_up', score_value: 15, is_active: true },
  { name: 'Routine referral', category: 'referral_type', condition_key: 'routine', score_value: 5, is_active: true },
  { name: 'Low severity', category: 'severity', condition_key: 'low', score_value: 5, is_active: true },
  { name: 'Moderate severity', category: 'severity', condition_key: 'moderate', score_value: 15, is_active: true },
  { name: 'High severity', category: 'severity', condition_key: 'high', score_value: 35, is_active: true },
  { name: 'Critical severity', category: 'severity', condition_key: 'critical', score_value: 60, is_active: true },
];

const systemSettings = [
  { setting_key: 'sms.approval.enabled', setting_value: 'true', description: 'Send SMS after referral approval and queue assignment' },
  { setting_key: 'sms.reminder.enabled', setting_value: 'true', description: 'Send SMS appointment reminders' },
  { setting_key: 'sms.missed.enabled', setting_value: 'true', description: 'Send SMS when referral visit is missed' },
  { setting_key: 'sms.queue_call.enabled', setting_value: 'true', description: 'Send SMS when city staff calls a patient from the queue' },
  { setting_key: 'sms.completion.enabled', setting_value: 'true', description: 'Send thank-you SMS when a referral visit is marked complete' },
  { setting_key: 'sms.cancel.enabled', setting_value: 'true', description: 'Send SMS when a referral booking is canceled' },
  { setting_key: 'sms.reschedule.enabled', setting_value: 'true', description: 'Send SMS when a referral appointment is rescheduled' },
  { setting_key: 'email.reminder.enabled', setting_value: 'true', description: 'Send email appointment reminders' },
  { setting_key: 'email.queue_call.enabled', setting_value: 'true', description: 'Send email when city staff calls a patient from the queue' },
  { setting_key: 'priority.emergency.threshold', setting_value: '100', description: 'Minimum score for Priority 1 Emergency' },
  { setting_key: 'priority.vulnerable.threshold', setting_value: '50', description: 'Minimum score for Priority 2 Vulnerable Group' },
];

async function upsertHealthCenters() {
  for (const center of healthCenters) {
    await pool.query(
      `INSERT INTO health_centers (id, name, type, address, contact_number, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, address = EXCLUDED.address,
         contact_number = EXCLUDED.contact_number, status = EXCLUDED.status, updated_at = NOW()`,
      [center.id, center.name, center.type, center.address, center.contact_number, center.status],
    );
  }
  await pool.query("SELECT setval(pg_get_serial_sequence('health_centers', 'id'), (SELECT MAX(id) FROM health_centers))");
}

async function upsertUsers() {
  for (const user of users) {
    await pool.query(
      `INSERT INTO users (id, health_center_id, name, email, password, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET health_center_id = EXCLUDED.health_center_id, name = EXCLUDED.name,
         email = EXCLUDED.email, password = EXCLUDED.password, role = EXCLUDED.role, status = EXCLUDED.status, updated_at = NOW()`,
      [user.id, user.health_center_id, user.name, user.email, user.password, user.role, user.status],
    );
  }
  await pool.query("SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users))");
}

async function seedPriorityRules() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM priority_rules');
  if (rows[0]?.count > 0) return;

  for (const rule of priorityRules) {
    await pool.query(
      `INSERT INTO priority_rules (name, category, condition_key, score_value, is_active)
       VALUES ($1, $2, $3, $4, $5)`,
      [rule.name, rule.category, rule.condition_key, rule.score_value, rule.is_active],
    );
  }
}

async function seedSystemSettings() {
  for (const setting of systemSettings) {
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, description = EXCLUDED.description, updated_at = NOW()`,
      [setting.setting_key, setting.setting_value, setting.description],
    );
  }
}

export async function seedCareLink() {
  console.log('Seeding CareLink database...');
  await upsertHealthCenters();
  await upsertUsers();
  await seedPriorityRules();
  await seedSystemSettings();
  console.log('Seed completed.');
  console.log('Default login: admin@carelink.local / password123');
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  seedCareLink()
    .catch((error) => {
      console.error('Supabase seed failed:', error.message);
      process.exit(1);
    })
    .finally(() => pool.end());
}
