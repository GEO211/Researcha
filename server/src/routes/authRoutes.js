import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { findReferralByCode, findUserByEmail, getUser, updateUser, updateUserLastLogin } from '../lib/supabase/store.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';
import { PERMISSIONS, permissionsForRole } from '../../../shared/rbac.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const patientLoginSchema = z.object({
  tracking_code: z.string().trim().min(3, 'Tracking code is required.'),
  last_name: z.string().trim().min(1, 'Last name is required.'),
});

const profileSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

const passwordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

function signUser(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

function withPermissions(user) {
  return {
    ...user,
    permissions: permissionsForRole(user.role),
  };
}

router.post('/login', async (req, res, next) => {
  try {
    const credentials = loginSchema.parse(req.body);
    const user = await findUserByEmail(credentials.email);

    if (!user || !(await bcrypt.compare(credentials.password, user.password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    await updateUserLastLogin(user.id);

    const payload = withPermissions({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      health_center_id: user.health_center_id,
      health_center_name: user.health_center_name,
    });

    const token = signUser(payload);
    await audit({ ...req, user: payload }, 'auth.login', 'user', user.id);
    return res.json({ token, user: payload });
  } catch (error) {
    return next(error);
  }
});

router.post('/patient', async (req, res, next) => {
  try {
    const credentials = patientLoginSchema.parse(req.body);
    const referral = await findReferralByCode(credentials.tracking_code);

    if (!referral) {
      return res.status(404).json({ message: 'Referral tracking code not found.' });
    }

    const expected = String(referral.last_name || '').trim().toLowerCase();
    const given = credentials.last_name.trim().toLowerCase();
    if (!expected || expected !== given) {
      return res.status(401).json({ message: 'Tracking code and last name do not match.' });
    }

    const payload = withPermissions({
      id: `patient-${referral.patient_id}`,
      name: [referral.first_name, referral.last_name].filter(Boolean).join(' ') || 'Patient',
      email: referral.email || null,
      role: 'patient',
      patient_id: referral.patient_id,
      tracking_code: referral.referral_code,
      health_center_id: referral.receiving_health_center_id || null,
      health_center_name: referral.receiving_center_name || null,
    });

    const token = signUser(payload);
    return res.json({ token, user: payload });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: withPermissions(req.user) });
});

router.patch('/me', authenticate, authorize(PERMISSIONS.PROFILE_UPDATE), async (req, res, next) => {
  try {
    if (req.user.role === 'patient' || Number.isNaN(Number(req.user.id))) {
      return res.status(403).json({ message: 'Patient portal accounts cannot change staff profile settings.' });
    }
    const data = profileSchema.parse(req.body);
    const existing = await getUser(req.user.id);

    if (!existing) {
      return res.status(404).json({ message: 'User not found.' });
    }

    await updateUser(req.user.id, { name: data.name, email: data.email });

    const user = withPermissions({
      id: req.user.id,
      role: req.user.role,
      health_center_id: req.user.health_center_id,
      health_center_name: req.user.health_center_name,
      ...data,
    });
    const token = signUser(user);

    await audit(req, 'auth.profile_updated', 'user', req.user.id, existing, data);
    return res.json({ token, user });
  } catch (error) {
    return next(error);
  }
});

router.patch('/password', authenticate, authorize(PERMISSIONS.PROFILE_UPDATE), async (req, res, next) => {
  try {
    const data = passwordSchema.parse(req.body);
    const user = await getUser(req.user.id);

    if (!user || !(await bcrypt.compare(data.current_password, user.password))) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    const password = await bcrypt.hash(data.new_password, 10);
    await updateUser(req.user.id, { password });
    await audit(req, 'auth.password_changed', 'user', req.user.id);

    return res.json({ message: 'Password updated.' });
  } catch (error) {
    return next(error);
  }
});

export default router;
