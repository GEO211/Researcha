import { Router } from 'express';
import { authenticate, authorize, preventProfessionalSelfAccess } from '../middleware/auth.js';
import {
  archivePatient,
  createPatient,
  findDuplicatePatient,
  getHealthCenter,
  getPatient,
  listHealthCenters,
  listPatients,
  restorePatient,
  transferPatient,
  updatePatient,
} from '../lib/supabase/store.js';
import { getPatientPortalProfile } from '../lib/supabase/patientPortalStore.js';
import { duplicatePatientMessage, normalizePatientRecord, patientSchema } from '../lib/patientRules.js';
import { barangayAddressLabel, findHealthCenterForBarangay, matchBarangayName } from '../data/koronadalBarangays.js';
import { audit } from '../services/auditService.js';
import { invalidateForecastCache } from '../services/forecastService.js';
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
  if (req.query.limit) filters.limit = Number(req.query.limit);
  if (req.query.include_archived === '1') filters.includeArchived = true;
  if (req.query.record_status) filters.recordStatus = req.query.record_status;
  return filters;
}

const ARCHIVE_REASONS = {
  duplicate: 'Duplicate entry',
  transferred: 'Transferred out of catchment area',
  deceased: 'Deceased',
  other: 'Other',
};

function archiveReasonLabel(code) {
  return ARCHIVE_REASONS[code] || '';
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
    invalidateForecastCache();
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

    if (req.user.role === 'patient') {
      if (Number(req.user.patient_id) !== id) {
        return res.status(403).json({ message: 'You can only view your own patient record.' });
      }
      const profile = await getPatientPortalProfile(req.user);
      return res.json({ patient: profile });
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

    if (existing.record_status === 'archived') {
      return res.status(409).json({ message: 'This patient record is archived. Restore it before editing.' });
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

    const {
      record_status: _recordStatus,
      archive_reason: _archiveReason,
      archive_note: _archiveNote,
      archived_at: _archivedAt,
      archived_by_user_id: _archivedBy,
      ...editable
    } = nextPatient;
    const updated = await updatePatient(id, editable);
    invalidateForecastCache();
    await audit(req, 'patient.updated', 'patient', id, existing, parsed);
    return res.json({ patient: updated });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/archive', authenticate, authorize(PERMISSIONS.PATIENTS_ARCHIVE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await getPatient(id);
    if (!existing) return res.status(404).json({ message: 'Patient not found.' });
    if (existing.record_status === 'archived') {
      return res.status(409).json({ message: 'This patient record is already archived.' });
    }

    const reasonCode = String(req.body?.reason || '');
    const reason = archiveReasonLabel(reasonCode);
    const note = String(req.body?.note || '').trim().slice(0, 300);
    if (!reason) {
      return res.status(400).json({ message: 'Choose why this patient record is being archived.' });
    }
    if (reasonCode === 'other' && note.length < 3) {
      return res.status(400).json({ message: 'Write a short reason before archiving this record.' });
    }

    const patient = await archivePatient(id, { reason: reasonCode, note, userId: req.user.id });
    await audit(req, 'patient.archived', 'patient', id, { record_status: 'active' }, {
      record_status: 'archived',
      reason,
      reason_code: reasonCode,
      note: note || null,
    });
    return res.json({ patient });
  } catch (error) {
    return next(error);
  }
});

function addressForBarangayCenter(center) {
  const barangay = matchBarangayName(center.barangay_name) || matchBarangayName(center.name) || matchBarangayName(center.address);
  return barangay ? barangayAddressLabel(barangay) : center.address;
}

router.post('/:id/transfer', authenticate, authorize(PERMISSIONS.PATIENTS_ARCHIVE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await getPatient(id);
    if (!existing) return res.status(404).json({ message: 'Patient not found.' });
    if (existing.record_status === 'archived') {
      return res.status(409).json({ message: 'Restore this patient record before transferring it.' });
    }

    const center = await getHealthCenter(Number(req.body?.health_center_id));
    if (!center || center.type !== 'barangay' || center.status !== 'active') {
      return res.status(400).json({ message: 'Choose an active barangay health center.' });
    }
    if (Number(existing.health_center_id) === Number(center.id)) {
      return res.status(409).json({ message: 'This patient is already registered at that barangay.' });
    }

    const address = addressForBarangayCenter(center);
    const patient = await transferPatient(id, { healthCenterId: center.id, address });
    await audit(req, 'patient.transferred', 'patient', id, {
      health_center_id: existing.health_center_id,
      health_center_name: existing.health_center_name,
      address: existing.address,
    }, {
      reason: `Transferred to ${center.name}`,
      from_center: existing.health_center_name,
      to_center: center.name,
      health_center_id: center.id,
      address,
    });
    return res.json({ patient });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/restore', authenticate, authorize(PERMISSIONS.PATIENTS_ARCHIVE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await getPatient(id);
    if (!existing) return res.status(404).json({ message: 'Patient not found.' });
    if (existing.record_status !== 'archived') {
      return res.status(409).json({ message: 'This patient record is already active.' });
    }

    const patient = await restorePatient(id);
    await audit(req, 'patient.restored', 'patient', id, {
      record_status: 'archived',
      reason: archiveReasonLabel(existing.archive_reason),
      note: existing.archive_note || null,
    }, { record_status: 'active' });
    return res.json({ patient });
  } catch (error) {
    return next(error);
  }
});

export default router;
