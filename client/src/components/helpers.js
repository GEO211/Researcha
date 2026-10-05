import { Activity, Bell, Building2, ClipboardList, HeartPulse, History, LayoutDashboard, Mail, Settings, Star, UserRound, Users } from 'lucide-react';

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
    critical: 'Critical priority',
    high: 'High priority',
    medium: 'Medium priority',
    normal: 'Normal priority',
    priority_1_emergency: 'Priority 1 Emergency',
    priority_2_vulnerable: 'Priority 2 Vulnerable',
    priority_3_standard: 'Priority 3 Standard',
  }[priority] || 'Not assigned';
}

export function tabLabel(tabId, role) {
  if (role === 'patient') {
    return {
      dashboard: 'Queue Status',
      history: 'History',
      ratings: 'Ratings & Feedback',
      profile: 'Profile',
      tracking: 'Tracking',
    }[tabId] || tabId;
  }
  return {
    dashboard: 'Dashboard',
    patients: 'Patients',
    referrals: 'Referrals',
    queue: 'Queue',
    analytics: 'Analytics',
    ratings: 'Ratings & Feedback',
    tracking: 'Tracking',
    profile: 'Settings',
    admin: 'Admin',
    'admin-patients': 'Patients',
    'admin-users': 'Users',
    'admin-centers': 'Health Centers',
    'admin-sms': 'SMS Logs',
    'admin-email': 'Email Logs',
    'admin-audit': 'Audit Logs',
  }[tabId] || tabId;
}

export function formatTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(value) {
  if (!value) return '—';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10)) && !raw.includes('T')) {
    const [year, month, day] = raw.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { dateStyle: 'medium' });
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' });
}

export function prettyEnum(value) {
  if (!value) return '—';
  return String(value).replaceAll('_', ' ');
}

export function tabIcon(tabId, role) {
  if (role === 'patient') {
    return {
      dashboard: Bell,
      history: History,
      ratings: Star,
      profile: UserRound,
      tracking: HeartPulse,
    }[tabId] || Bell;
  }
  return {
    dashboard: LayoutDashboard,
    patients: Users,
    referrals: ClipboardList,
    queue: Bell,
    analytics: Activity,
    ratings: Star,
    tracking: HeartPulse,
    profile: Settings,
    admin: Settings,
    'admin-patients': UserRound,
    'admin-users': Users,
    'admin-centers': Building2,
    'admin-sms': ClipboardList,
    'admin-email': Mail,
    'admin-audit': ClipboardList,
  }[tabId] || Activity;
}
