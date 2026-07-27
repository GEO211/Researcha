import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { createHealthCenter, getHealthCenter, listHealthCenters, updateHealthCenter } from '../lib/supabase/store.js';
import { audit } from '../services/auditService.js';

const router = Router();

const healthCenterSchema = z.object({
  name: z.string().min(2),
  type: z.enum(['barangay', 'city']),
  address: z.string().min(2),
  contact_number: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
});

router.get('/', authenticate, async (_req, res, next) => {
  try {
    const healthCenters = await listHealthCenters();
    res.json({ healthCenters });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize('super_admin'), async (req, res, next) => {
  try {
    const data = healthCenterSchema.parse(req.body);
    const created = await createHealthCenter(data);

    await audit(req, 'health_center.created', 'health_center', created.id, null, data);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', authenticate, authorize('super_admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = healthCenterSchema.partial().parse(req.body);
    const existing = await getHealthCenter(id);

    if (!existing) {
      return res.status(404).json({ message: 'Health center not found.' });
    }

    const updated = await updateHealthCenter(id, { ...existing, ...data });
    await audit(req, 'health_center.updated', 'health_center', id, existing, data);
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

export default router;
