import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { findReferralByCode, findUserByEmail, getUser, updateUser, updateUserLastLogin } from '../lib/supabase/store.js';
import { normalizePhMobile } from '../lib/patientRules.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';
import { PERMISSIONS, permissionsForRole } from '../../../shared/rbac.js';
import { EMAIL_PROVIDER_MESSAGE, isRecognizedEmail } from '../../../shared/emailProviders.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const patientLoginSchema = z.object({
  tracking_code: z.string().trim().min(3, 'Tracking code is required.'),
  last_name: z.string().trim().min(1, 'Last name is required.'),
});

const AVATAR_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/=\s]+$/;

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
  email: z.string().trim().email('Enter a valid email address.'),
  contact_number: z.string().optional().nullable(),
  avatar: z.string().max(400000, 'Profile photo is too large.').optional().nullable(),
});

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required.'),
  new_password: z.string().min(8, 'New password must be at least 8 characters.'),
  confirm_password: z.string().min(1, 'Confirm your new password.'),
}).refine((data) => data.new_password === data.confirm_password, {
  message: 'New password and confirmation do not match.',
  path: ['confirm_password'],
});

function publicUser(user, extras = {}) {
  return withPermissions({
    id: user.id,
    name: user.name,
    email: user.email,
    contact_number: user.contact_number || null,
    avatar: user.avatar || null,
    role: user.role,
    status: user.status || 'active',
    last_login_at: user.last_login_at || null,
    health_center_id: user.health_center_id ?? null,
    health_center_name: extras.health_center_name ?? user.health_center_name ?? null,
  });
}

function profileSnapshot(user) {
  return {
    name: user.name,
    email: user.email,
    contact_number: user.contact_number || null,
    avatar: user.avatar ? 'base64' : null,
  };
}

function signUser(payload) {
  const { avatar: _avatar, ...claims } = payload;
  return jwt.sign(claims, process.env.JWT_SECRET || 'dev-secret', {
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
    const fresh = await getUser(user.id);

    const payload = publicUser(
      { ...user, ...fresh, health_center_name: user.health_center_name },
      { health_center_name: user.health_center_name },
    );

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

router.get('/me', authenticate, async (req, res, next) => {
  try {
    if (req.user.role === 'patient' || Number.isNaN(Number(req.user.id))) {
      return res.json({ user: withPermissions(req.user) });
    }
    const existing = await getUser(req.user.id);
    if (!existing) return res.status(404).json({ message: 'User not found.' });
    return res.json({ user: publicUser(existing, { health_center_name: req.user.health_center_name }) });
  } catch (error) {
    return next(error);
  }
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

    const rawContact = String(data.contact_number || '').trim();
    let contactNumber = null;
    if (rawContact) {
      contactNumber = normalizePhMobile(data.contact_number);
      if (!contactNumber) {
        throw new z.ZodError([{
          code: 'custom',
          path: ['contact_number'],
          message: 'Enter a PH mobile number (+639XXXXXXXXX).',
        }]);
      }
    }

    const currentEmail = String(existing.email || '').trim().toLowerCase();
    if (data.email.trim().toLowerCase() !== currentEmail && !isRecognizedEmail(data.email)) {
      throw new z.ZodError([{
        code: 'custom',
        path: ['email'],
        message: EMAIL_PROVIDER_MESSAGE,
      }]);
    }

    const emailOwner = await findUserByEmail(data.email);
    if (emailOwner && Number(emailOwner.id) !== Number(req.user.id)) {
      return res.status(409).json({ message: 'That email is already used by another account.' });
    }

    let avatar = existing.avatar || null;
    if (Object.prototype.hasOwnProperty.call(data, 'avatar')) {
      const nextAvatar = String(data.avatar || '').trim();
      if (nextAvatar && !AVATAR_DATA_URL.test(nextAvatar)) {
        throw new z.ZodError([{
          code: 'custom',
          path: ['avatar'],
          message: 'Profile photo must be a base64 JPEG image.',
        }]);
      }
      avatar = nextAvatar || null;
    }

    const saved = {
      name: data.name,
      email: data.email,
      contact_number: contactNumber,
      avatar,
    };
    await updateUser(req.user.id, saved);

    const user = publicUser(
      { ...existing, ...saved },
      { health_center_name: req.user.health_center_name },
    );
    const token = signUser(user);

    await audit(req, 'auth.profile_updated', 'user', req.user.id, profileSnapshot(existing), {
      ...saved,
      avatar: saved.avatar ? 'base64' : null,
    });
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

    if (data.current_password === data.new_password) {
      return res.status(400).json({ message: 'Choose a new password that is different from the current one.' });
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
