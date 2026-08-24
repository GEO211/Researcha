import { Activity, Bell, ClipboardList, HeartPulse, LayoutDashboard, Settings, Users } from 'lucide-react';

export function classNames(...items) {
  return items.filter(Boolean).join(' ');
}

export function roleLabel(role) {
  return {
    super_admin: 'Super Admin',
    barangay_staff: 'Barangay Staff',
    city_staff: 'City Staff',
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
    evaluation: 'Evaluation',
    profile: 'Profile',
    admin: 'Admin',
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
    evaluation: ClipboardList,
    profile: Users,
    admin: Settings,
  }[tabId] || Activity;
}
