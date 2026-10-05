export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  CITY_STAFF: 'city_staff',
  BARANGAY_STAFF: 'barangay_staff',
  PATIENT: 'patient',
};

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  DASHBOARD_AI: 'dashboard.ai',
  PATIENTS_VIEW: 'patients.view',
  PATIENTS_CREATE: 'patients.create',
  PATIENTS_UPDATE: 'patients.update',
  PATIENTS_ARCHIVE: 'patients.archive',
  REFERRALS_VIEW: 'referrals.view',
  REFERRALS_CREATE: 'referrals.create',
  REFERRALS_REVIEW: 'referrals.review',
  REFERRALS_TRANSFER: 'referrals.transfer',
  QUEUE_VIEW: 'queue.view',
  QUEUE_CALL: 'queue.call',
  ANALYTICS_VIEW: 'analytics.view',
  TRACKING_VIEW: 'tracking.view',
  TRACKING_OWN: 'tracking.own',
  PROFILE_VIEW: 'profile.view',
  PROFILE_UPDATE: 'profile.update',
  USERS_MANAGE: 'users.manage',
  CENTERS_VIEW: 'centers.view',
  CENTERS_MANAGE: 'centers.manage',
  SETTINGS_MANAGE: 'settings.manage',
  SMS_VIEW: 'sms.view',
  SMS_SEND: 'sms.send',
  EMAIL_VIEW: 'email.view',
  AUDIT_VIEW: 'audit.view',
  ADMIN_LOGS: 'admin.logs',
  OFFLINE_SYNC: 'offline.sync',
  RATINGS_VIEW: 'ratings.view',
  RATINGS_MODERATE: 'ratings.moderate',
};

const P = PERMISSIONS;

const SUPER_ADMIN = [
  P.DASHBOARD_VIEW,
  P.PATIENTS_VIEW,
  P.PATIENTS_ARCHIVE,
  P.USERS_MANAGE,
  P.CENTERS_VIEW,
  P.CENTERS_MANAGE,
  P.SMS_VIEW,
  P.EMAIL_VIEW,
  P.AUDIT_VIEW,
  P.ADMIN_LOGS,
  P.PROFILE_VIEW,
  P.PROFILE_UPDATE,
  P.OFFLINE_SYNC,
  P.RATINGS_VIEW,
  P.RATINGS_MODERATE,
];

const CITY_HEALTH = [
  P.DASHBOARD_VIEW,
  P.DASHBOARD_AI,
  P.PATIENTS_VIEW,
  P.REFERRALS_VIEW,
  P.REFERRALS_REVIEW,
  P.REFERRALS_TRANSFER,
  P.QUEUE_VIEW,
  P.QUEUE_CALL,
  P.ANALYTICS_VIEW,
  P.TRACKING_VIEW,
  P.PROFILE_VIEW,
  P.PROFILE_UPDATE,
  P.CENTERS_VIEW,
  P.SMS_VIEW,
  P.SMS_SEND,
  P.EMAIL_VIEW,
  P.OFFLINE_SYNC,
  P.RATINGS_VIEW,
  P.RATINGS_MODERATE,
];

const BARANGAY_STAFF = [
  P.DASHBOARD_VIEW,
  P.DASHBOARD_AI,
  P.PATIENTS_VIEW,
  P.PATIENTS_CREATE,
  P.PATIENTS_UPDATE,
  P.REFERRALS_VIEW,
  P.REFERRALS_CREATE,
  P.REFERRALS_TRANSFER,
  P.QUEUE_VIEW,
  P.QUEUE_CALL,
  P.TRACKING_VIEW,
  P.PROFILE_VIEW,
  P.PROFILE_UPDATE,
  P.CENTERS_VIEW,
  P.OFFLINE_SYNC,
];

const PATIENT = [
  P.DASHBOARD_VIEW,
  P.TRACKING_OWN,
  P.PROFILE_VIEW,
  P.OFFLINE_SYNC,
];

export const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: SUPER_ADMIN,
  [ROLES.CITY_STAFF]: CITY_HEALTH,
  [ROLES.BARANGAY_STAFF]: BARANGAY_STAFF,
  [ROLES.PATIENT]: PATIENT,
};

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.CITY_STAFF]: 'City Health Personnel',
  [ROLES.BARANGAY_STAFF]: 'Barangay Staff',
  [ROLES.PATIENT]: 'Patient',
};

export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export function hasPermission(role, ...required) {
  if (!required.length) return Boolean(role);
  const granted = new Set(permissionsForRole(role));
  return required.some((permission) => granted.has(permission));
}

export function hasAllPermissions(role, ...required) {
  const granted = new Set(permissionsForRole(role));
  return required.every((permission) => granted.has(permission));
}

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', permission: P.DASHBOARD_VIEW },
  { id: 'admin-patients', label: 'Patients', permission: P.USERS_MANAGE },
  { id: 'patients', label: 'Patients', permission: P.PATIENTS_CREATE },
  { id: 'referrals', label: 'Referrals', anyOf: [P.REFERRALS_CREATE, P.REFERRALS_REVIEW] },
  { id: 'queue', label: 'Queue', permission: P.QUEUE_VIEW },
  { id: 'analytics', label: 'Analytics', permission: P.ANALYTICS_VIEW },
  { id: 'ratings', label: 'Ratings & Feedback', permission: P.RATINGS_VIEW },
  { id: 'tracking', label: 'Tracking', anyOf: [P.TRACKING_VIEW, P.TRACKING_OWN] },
  { id: 'admin-users', label: 'Users', permission: P.USERS_MANAGE },
  { id: 'admin-centers', label: 'Health Centers', permission: P.CENTERS_MANAGE },
  { id: 'admin-sms', label: 'SMS Logs', permission: P.ADMIN_LOGS },
  { id: 'admin-email', label: 'Email Logs', permission: P.ADMIN_LOGS },
  { id: 'admin-audit', label: 'Audit Logs', permission: P.AUDIT_VIEW },
  { id: 'profile', label: 'Settings', permission: P.PROFILE_VIEW },
];

export const PATIENT_NAV_ITEMS = [
  { id: 'dashboard', label: 'Queue Status', permission: P.DASHBOARD_VIEW },
  { id: 'history', label: 'History', permission: P.TRACKING_OWN },
  { id: 'ratings', label: 'Ratings & Feedback', permission: P.TRACKING_OWN },
  { id: 'profile', label: 'Profile', permission: P.PROFILE_VIEW },
];

export function navigationForRole(role) {
  if (role === ROLES.PATIENT) return PATIENT_NAV_ITEMS;
  return NAV_ITEMS.filter((item) => {
    if (item.anyOf) return hasPermission(role, ...item.anyOf);
    return hasPermission(role, item.permission);
  });
}

export function describeRole(role) {
  return ROLE_LABELS[role] || role || 'Unknown';
}
