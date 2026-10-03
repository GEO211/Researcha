import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { createUser, getHealthCenter, getUser, listUsers, updateUser } from '../lib/supabase/store.js';
import { audit } from '../services/auditService.js';
import { PERMISSIONS } from '../../../shared/rbac.js';

const router = Router();

const userNameSchema = z.string()
  .trim()
  .min(2, 'Name is required.')
  .refine((value) => !/\d/.test(value), { message: 'Name must not contain numbers.' });

const userSchema = z.object({
  health_center_id: z.coerce.number().int().positive().optional().nullable(),
  name: userNameSchema,
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').optional(),
  role: z.enum(['super_admin', 'barangay_staff', 'city_staff'], { message: 'Select a valid role.' }),
  status: z.enum(['active', 'disabled'], { message: 'Select a valid status.' }).default('active'),
});

router.get('/', authenticate, authorize(PERMISSIONS.USERS_MANAGE), async (_req, res, next) => {
  try {
    const users = await listUsers();
    res.json({ users: users.map(({ password, ...user }) => user) });
  } catch (error) {
    next(error);
  }
});

async function assignmentError(role, healthCenterId) {
  if (role === 'barangay_staff') {
    if (!healthCenterId) {
      return { status: 400, message: 'Assign barangay staff to a barangay health center.' };
    }
    const center = await getHealthCenter(healthCenterId);
    if (!center || center.type !== 'barangay') {
      return { status: 400, message: 'Barangay staff must be assigned to a barangay health center.' };
    }
  }
  if (role === 'city_staff' && healthCenterId) {
    const center = await getHealthCenter(healthCenterId);
    if (center && center.type !== 'city') {
      return { status: 400, message: 'City staff must be assigned to a city health center.' };
    }
  }
  return null;
}

router.post('/', authenticate, authorize(PERMISSIONS.USERS_MANAGE), async (req, res, next) => {
  try {
    const data = userSchema.required({ password: true }).parse(req.body);
    const invalid = await assignmentError(data.role, data.health_center_id);
    if (invalid) return res.status(invalid.status).json({ message: invalid.message });
    const password = await bcrypt.hash(data.password, 10);
    const created = await createUser({ ...data, password });

    await audit(req, 'user.created', 'user', created.id, null, { ...data, password: undefined });
    res.status(201).json({ ...created, password: undefined });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', authenticate, authorize(PERMISSIONS.USERS_MANAGE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = userSchema.partial().parse(req.body);
    const existing = await getUser(id);

    if (!existing) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const nextRole = data.role || existing.role;
    const nextCenterId = data.health_center_id !== undefined ? data.health_center_id : existing.health_center_id;
    const invalid = await assignmentError(nextRole, nextCenterId);
    if (invalid) return res.status(invalid.status).json({ message: invalid.message });

    const password = data.password ? await bcrypt.hash(data.password, 10) : existing.password;
    const updated = await updateUser(id, { ...existing, ...data, password });

    await audit(req, 'user.updated', 'user', id, { ...existing, password: undefined }, { ...data, password: undefined });
    return res.json({ ...updated, password: undefined });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', authenticate, authorize(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  return res.status(409).json({
    message: 'Accounts are not deleted. Deactivate the account so the audit history stays intact.',
  });
});

export default router;