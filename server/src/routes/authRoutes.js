import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { findUserByEmail, getUser, updateUser, updateUserLastLogin } from '../lib/supabase/store.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const profileSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

const passwordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

router.post('/login', async (req, res, next) => {
  try {
    const credentials = loginSchema.parse(req.body);
    const user = await findUserByEmail(credentials.email);

    if (!user || !(await bcrypt.compare(credentials.password, user.password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    await updateUserLastLogin(user.id);

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      health_center_id: user.health_center_id,
      health_center_name: user.health_center_name,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    await audit({ ...req, user: payload }, 'auth.login', 'user', user.id);
    return res.json({ token, user: payload });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.patch('/me', authenticate, async (req, res, next) => {
  try {
    const data = profileSchema.parse(req.body);
    const existing = await getUser(req.user.id);

    if (!existing) {
      return res.status(404).json({ message: 'User not found.' });
    }

    await updateUser(req.user.id, { name: data.name, email: data.email });

    const user = {
      id: req.user.id,
      role: req.user.role,
      health_center_id: req.user.health_center_id,
      health_center_name: req.user.health_center_name,
      ...data,
    };
    const token = jwt.sign(user, process.env.JWT_SECRET || 'dev-secret', {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    await audit(req, 'auth.profile_updated', 'user', req.user.id, existing, data);
    return res.json({ token, user });
  } catch (error) {
    return next(error);
  }
});

router.patch('/password', authenticate, async (req, res, next) => {
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
