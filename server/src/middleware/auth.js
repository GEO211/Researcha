import jwt from 'jsonwebtoken';
import { hasPermission } from '../../../shared/rbac.js';

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

export function authorize(...required) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const allowed = required.some((item) => {
      if (String(item).includes('.')) {
        return hasPermission(req.user.role, item);
      }
      return req.user.role === item || hasPermission(req.user.role, item);
    });

    if (!allowed) {
      return res.status(403).json({
        message: 'You do not have permission to access this resource.',
        required,
        role: req.user.role,
      });
    }

    return next();
  };
}

export function forbidPatientMutations(req, res, next) {
  if (req.user?.role === 'patient' && req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(403).json({ message: 'Patients can view their own care status only.' });
  }
  return next();
}

export function preventProfessionalSelfAccess(req, patient) {
  if (!req?.user || !patient || req.user.role !== 'city_staff') return false;

  const userName = String(req.user.name || '').trim().toLowerCase();
  const patientName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim().toLowerCase();
  const userEmail = String(req.user.email || '').trim().toLowerCase();
  const patientEmail = String(patient.email || '').trim().toLowerCase();

  return Boolean(
    (userName && patientName && userName === patientName)
    || (userEmail && patientEmail && userEmail === patientEmail),
  );
}
