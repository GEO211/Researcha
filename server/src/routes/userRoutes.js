import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { createUser, getUser, listUsers, updateUser } from '../lib/supabase/store.js';
import { audit } from '../services/auditService.js';

const router = Router();

const userSchema = z.object({
  health_center_id: z.coerce.number().int().positive().optional().nullable(),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(['super_admin', 'barangay_staff', 'city_staff']),
  status: z.enum(['active', 'disabled']).default('active'),
});

router.get('/', authenticate, authorize('super_admin'), async (_req, res, next) => {
  try {
    const users = await listUsers();
    res.json({ users: users.map(({ password, ...user }) => user) });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize('super_admin'), async (req, res, next) => {
  try {
    const data = userSchema.required({ password: true }).parse(req.body);
    const password = await bcrypt.hash(data.password, 10);
    const created = await createUser({ ...data, password });

    await audit(req, 'user.created', 'user', created.id, null, { ...data, password: undefined });
    res.status(201).json({ ...created, password: undefined });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', authenticate, authorize('super_admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = userSchema.partial().parse(req.body);
    const existing = await getUser(id);

    if (!existing) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const password = data.password ? await bcrypt.hash(data.password, 10) : existing.password;
    const updated = await updateUser(id, { ...existing, ...data, password });

    await audit(req, 'user.updated', 'user', id, { ...existing, password: undefined }, { ...data, password: undefined });
    return res.json({ ...updated, password: undefined });
  } catch (error) {
    return next(error);
  }
});

export default router;
