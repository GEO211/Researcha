import jwt from 'jsonwebtoken';

export const ROLE_PERMISSIONS = {
  super_admin: {
    view_all_patients: true,
    edit_all_patients: true,
    manage_users: true,
    manage_centers: true,
    manage_settings: true,
    review_referrals: true,
    view_audit: true,
    access_patient_self_record: true,
  },
  city_staff: {
    view_assigned_patients: true,
    review_referrals: true,
    manage_queue: true,
    view_audit: false,
    edit_all_patients: false,
    access_patient_self_record: false,
  },
  barangay_staff: {
    view_assigned_patients: true,
    create_patients: true,
    edit_assigned_patients: true,
    manage_queue: true,
    review_referrals: true,
    access_patient_self_record: false,
  },
  patient: {
    view_own_record: true,
    edit_own_record: true,
    view_own_referrals: true,
    access_patient_self_record: true,
  },
};

export function hasPermission(role, permission) {
  return Boolean(ROLE_PERMISSIONS[role]?.[permission]);
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !hasPermission(req.user.role, permission)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }

    return next();
  };
}

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to access this resource.' });
    }

    return next();
  };
}

export function preventProfessionalSelfAccess(req, patient) {
  if (!req?.user || !patient || req.user.role !== 'city_staff') {
    return false;
  }

  const userName = String(req.user.name || '').trim().toLowerCase();
  const patientName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim().toLowerCase();
  const userEmail = String(req.user.email || '').trim().toLowerCase();
  const patientEmail = String(patient.email || '').trim().toLowerCase();

  const sameName = userName && patientName && userName === patientName;
  const sameEmail = userEmail && patientEmail && userEmail === patientEmail;

  return sameName || sameEmail;
}
