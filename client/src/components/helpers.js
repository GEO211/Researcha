import { Activity, Bell, Building2, ClipboardList, HeartPulse, LayoutDashboard, Mail, Settings, Users } from 'lucide-react';

export function classNames(...items) {
  return items.filter(Boolean).join(' ');
}

export function roleLabel(role) {
  return {
    super_admin: 'Super Admin',
    barangay_staff: 'Barangay Staff',
    city_staff: 'City Health Personnel',
    patient: 'Patient',
  }[role] || role;
}

export function priorityLabel(priority) {
  return {
    priority_1_emergency: 'Priority 1 Emergency',
    priority_2_vulnerable: 'Priority 2 Vulnerable',
    priority_3_standard: 'Priority 3 Standard',
  }[priority] || 'Not assigned';
}

export function tabLabel(tabId) {
  return {
    dashboard: 'Dashboard',
    patients: 'Patients',
    referrals: 'Referrals',
    queue: 'Queue',
    analytics: 'Analytics',
    tracking: 'Tracking',
    profile: 'Settings',
    admin: 'Admin',
    'admin-users': 'Users',
    'admin-centers': 'Health Centers',
    'admin-sms': 'SMS Logs',
    'admin-email': 'Email Logs',
    'admin-audit': 'Audit Logs',
  }[tabId] || tabId;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function tabIcon(tabId) {
  return {
    dashboard: LayoutDashboard,
    patients: Users,
    referrals: ClipboardList,
    queue: Bell,
    analytics: Activity,
    tracking: HeartPulse,
    profile: Settings,
    admin: Settings,
    'admin-users': Users,
    'admin-centers': Building2,
    'admin-sms': ClipboardList,
    'admin-email': Mail,
    'admin-audit': ClipboardList,
  }[tabId] || Activity;
}
