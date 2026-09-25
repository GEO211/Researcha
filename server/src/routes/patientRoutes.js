import { Router } from 'express';
import { authenticate, authorize, preventProfessionalSelfAccess } from '../middleware/auth.js';
import {
  createPatient,
  findDuplicatePatient,
  getPatient,
  listHealthCenters,
  listPatients,
  updatePatient,
} from '../lib/supabase/store.js';
import { duplicatePatientMessage, normalizePatientRecord, patientSchema } from '../lib/patientRules.js';
import { findHealthCenterForBarangay } from '../data/koronadalBarangays.js';
import { audit } from '../services/auditService.js';
import { PERMISSIONS } from '../../../shared/rbac.js';

const router = Router();

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

function duplicateResponse(res, existing) {
  return res.status(409).json({
    message: duplicatePatientMessage(existing, existing.match_reason),
    code: 'patient_exists',
    existing_patient: {
      id: existing.id,
      first_name: existing.first_name,
      last_name: existing.last_name,
      birth_date: existing.birth_date,
      contact_number: existing.contact_number,
      email: existing.email,
    },
  });
}

router.get('/', authenticate, authorize(PERMISSIONS.PATIENTS_VIEW), async (req, res, next) => {
  try {
    const patients = await listPatients(buildFilters(req));
    res.json({ patients });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize(PERMISSIONS.PATIENTS_CREATE), async (req, res, next) => {
  try {
    const parsed = normalizePatientRecord(patientSchema.parse(req.body));
    const centers = await listHealthCenters();
    const matchedCenter = findHealthCenterForBarangay(parsed.address, centers);
    const data = {
      ...parsed,
      health_center_id: req.user.role === 'barangay_staff'
        ? req.user.health_center_id
        : (matchedCenter?.id || parsed.health_center_id),
    };

    if (!data.health_center_id) {
      return res.status(400).json({ message: 'A barangay health center is required before saving this patient.' });
    }

    const duplicate = await findDuplicatePatient(data);
    if (duplicate) return duplicateResponse(res, duplicate);

    const created = await createPatient(data);
    await audit(req, 'patient.created', 'patient', created.id, null, data);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, authorize(PERMISSIONS.PATIENTS_VIEW, PERMISSIONS.TRACKING_OWN), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const patient = await getPatient(id);

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found.' });
    }

    if (req.user.role === 'patient' && Number(req.user.patient_id) !== id) {
      return res.status(403).json({ message: 'You can only view your own patient record.' });
    }

    if (req.user.role === 'barangay_staff' && patient.health_center_id !== req.user.health_center_id) {
      return res.status(403).json({ message: 'Patient belongs to another health center.' });
    }

    if (preventProfessionalSelfAccess(req, patient)) {
      return res.status(403).json({
        message: 'City health staff cannot access personal medical records under professional credentials.',
      });
    }

    return res.json({ patient });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', authenticate, authorize(PERMISSIONS.PATIENTS_UPDATE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await getPatient(id);

    if (!existing) {
      return res.status(404).json({ message: 'Patient not found.' });
    }

    if (req.user.role === 'barangay_staff' && existing.health_center_id !== req.user.health_center_id) {
      return res.status(403).json({ message: 'Patient belongs to another health center.' });
    }

    if (preventProfessionalSelfAccess(req, existing)) {
      return res.status(403).json({
        message: 'City health staff cannot modify personal medical records under professional credentials.',
      });
    }

    const parsed = normalizePatientRecord(patientSchema.parse({
      ...existing,
      ...req.body,
      birth_date: String(req.body.birth_date || existing.birth_date || '').slice(0, 10),
    }));

    const nextPatient = {
      ...existing,
      ...parsed,
      health_center_id: req.user.role === 'barangay_staff'
        ? existing.health_center_id
        : (parsed.health_center_id || existing.health_center_id),
    };

    const duplicate = await findDuplicatePatient({ ...nextPatient, excludeId: id });
    if (duplicate) return duplicateResponse(res, duplicate);

    const updated = await updatePatient(id, nextPatient);
    await audit(req, 'patient.updated', 'patient', id, existing, parsed);
    return res.json({ patient: updated });
  } catch (error) {
    return next(error);
  }
});

export default router;
