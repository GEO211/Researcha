import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { createPatient, getPatient, listHealthCenters, listPatients, updatePatient } from '../lib/supabase/store.js';
import { findHealthCenterForBarangay } from '../data/koronadalBarangays.js';
import { audit } from '../services/auditService.js';

const router = Router();

const patientSchema = z.object({
  health_center_id: z.coerce.number().int().positive().optional(),
  first_name: z.string().min(1),
  middle_name: z.string().optional().nullable(),
  last_name: z.string().min(1),
  birth_date: z.string().min(10),
  sex: z.enum(['female', 'male', 'other']),
  contact_number: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().min(2),
  address2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  is_senior: z.boolean().default(false),
  is_pregnant: z.boolean().default(false),
  is_pwd: z.boolean().default(false),
  is_child: z.boolean().default(false),
  is_infant: z.boolean().default(false),
  is_indigenous: z.boolean().default(false),
  is_solo_parent: z.boolean().default(false),
  medical_notes: z.string().optional().nullable(),
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_number: z.string().optional().nullable(),
});

function buildFilters(req) {
  const filters = {};
  if (req.user.role === 'barangay_staff') {
    filters.healthCenterId = req.user.health_center_id;
  } else if (req.query.health_center_id) {
    filters.healthCenterId = Number(req.query.health_center_id);
  }
  if (req.query.q) filters.q = req.query.q;
  if (req.query.city) filters.city = req.query.city;
  if (req.query.province) filters.province = req.query.province;
  if (req.query.contact_number) filters.contactNumber = req.query.contact_number;
  if (req.query.email) filters.email = req.query.email;
  return filters;
}

router.get('/', authenticate, authorize('super_admin', 'barangay_staff', 'city_staff'), async (req, res, next) => {
  try {
    const patients = await listPatients(buildFilters(req));
    res.json({ patients });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize('barangay_staff', 'super_admin'), async (req, res, next) => {
  try {
    const parsed = patientSchema.parse(req.body);
    const centers = await listHealthCenters();
    const matchedCenter = findHealthCenterForBarangay(parsed.address, centers);
    const data = {
      ...parsed,
      health_center_id: req.user.role === 'barangay_staff'
        ? req.user.health_center_id
        : (matchedCenter?.id || parsed.health_center_id),
      middle_name: parsed.middle_name || null,
      contact_number: parsed.contact_number || null,
      email: parsed.email || null,
      address2: parsed.address2 || null,
      city: parsed.city || null,
      postal_code: parsed.postal_code || null,
      province: parsed.province || null,
      medical_notes: parsed.medical_notes || null,
      emergency_contact_name: parsed.emergency_contact_name || null,
      emergency_contact_number: parsed.emergency_contact_number || null,
    };

    if (!data.health_center_id) {
      return res.status(400).json({ message: 'health_center_id is required.' });
    }

    const created = await createPatient(data);
    await audit(req, 'patient.created', 'patient', created.id, null, data);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, authorize('super_admin', 'barangay_staff', 'city_staff'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const patient = await getPatient(id);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found.' });
    }

    if (req.user.role === 'barangay_staff' && patient.health_center_id !== req.user.health_center_id) {
      return res.status(403).json({ message: 'Patient belongs to another health center.' });
    }

    return res.json({ patient });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', authenticate, authorize('super_admin', 'barangay_staff'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = patientSchema.partial().parse(req.body);
    const existing = await getPatient(id);

    if (!existing) {
      return res.status(404).json({ message: 'Patient not found.' });
    }

    if (req.user.role === 'barangay_staff' && existing.health_center_id !== req.user.health_center_id) {
      return res.status(403).json({ message: 'Patient belongs to another health center.' });
    }

    const nextPatient = {
      ...existing,
      ...data,
      health_center_id: req.user.role === 'barangay_staff' ? existing.health_center_id : data.health_center_id || existing.health_center_id,
    };

    const updated = await updatePatient(id, nextPatient);
    await audit(req, 'patient.updated', 'patient', id, existing, data);
    return res.json({ patient: updated });
  } catch (error) {
    return next(error);
  }
});

export default router;
