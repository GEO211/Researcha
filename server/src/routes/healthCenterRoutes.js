import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { createHealthCenter, deleteHealthCenter, getHealthCenter, listHealthCenters, updateHealthCenter } from '../lib/supabase/store.js';
import { audit } from '../services/auditService.js';
import { PERMISSIONS } from '../../../shared/rbac.js';
import { normalizePhMobile } from '../lib/patientRules.js';

const router = Router();

const healthCenterFields = {
  name: z.string().min(2),
  type: z.enum(['barangay', 'city']),
  address: z.string().min(2),
  contact_number: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
  barangay_name: z.string().optional().nullable(),
};

function parseHealthCenter(body, { partial = false } = {}) {
  const schema = z.object(healthCenterFields);
  const parsed = (partial ? schema.partial() : schema).parse(body);
  if (!Object.prototype.hasOwnProperty.call(parsed, 'contact_number') && partial) return parsed;
  if (!String(parsed.contact_number || '').trim()) {
    return { ...parsed, contact_number: null };
  }
  const contact = normalizePhMobile(parsed.contact_number);
  if (!contact) {
    throw new z.ZodError([{
      code: 'custom',
      path: ['contact_number'],
      message: 'Enter a PH mobile number (+639XXXXXXXXX).',
    }]);
  }
  return { ...parsed, contact_number: contact };
}

router.get('/', authenticate, authorize(PERMISSIONS.CENTERS_VIEW, PERMISSIONS.CENTERS_MANAGE), async (_req, res, next) => {
  try {
    const healthCenters = await listHealthCenters();
    res.json({ healthCenters });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize(PERMISSIONS.CENTERS_MANAGE), async (req, res, next) => {
  try {
    const data = parseHealthCenter(req.body);
    const created = await createHealthCenter(data);

    await audit(req, 'health_center.created', 'health_center', created.id, null, data);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', authenticate, authorize(PERMISSIONS.CENTERS_MANAGE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = parseHealthCenter(req.body, { partial: true });
    const existing = await getHealthCenter(id);

    if (!existing) {
      return res.status(404).json({ message: 'Health center not found.' });
    }

    const updated = await updateHealthCenter(id, data);
    await audit(req, 'health_center.updated', 'health_center', id, existing, data);
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', authenticate, authorize(PERMISSIONS.CENTERS_MANAGE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await getHealthCenter(id);
    if (!existing) return res.status(404).json({ message: 'Health center not found.' });
    await deleteHealthCenter(id);
    await audit(req, 'health_center.deleted', 'health_center', id, existing, null);
    return res.json({ message: 'Health center deleted.' });
  } catch (error) {
    return next(error);
  }
});

export default router;
