import { z } from 'zod';

const NAME_PATTERN = /^[\p{L}\p{M}\s.'-]+$/u;
const POSTAL_PATTERN = /^\d{4}$/;

export function collapseName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function normalizeEmail(value) {
  const trimmed = String(value || '').trim().toLowerCase();
  return trimmed || null;
}

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function phMobileDigits(value) {
  const digits = digitsOnly(value);
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^639\d{9}$/.test(digits)) return digits;
  if (/^9\d{9}$/.test(digits)) return `63${digits}`;
  return null;
}

export function normalizePhMobile(value) {
  if (!String(value ?? '').trim()) return null;
  const digits = phMobileDigits(value);
  return digits ? `+${digits}` : undefined;
}

export function isValidPhMobile(value) {
  if (!String(value || '').trim()) return true;
  return Boolean(normalizePhMobile(value));
}

export function ageFromBirthDate(isoDate, now = new Date()) {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const birth = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

function optionalName(message = 'Use letters, spaces, hyphens, or apostrophes only.') {
  return z.preprocess(
    (value) => collapseName(value) || null,
    z.union([
      z.null(),
      z.string().max(100).regex(NAME_PATTERN, message),
    ]).optional(),
  );
}

function requiredName(label) {
  return z.preprocess((value) => collapseName(value), z.string().superRefine((value, ctx) => {
    if (!value) {
      ctx.addIssue({ code: 'custom', message: `${label} is required.` });
      return;
    }
    if (value.length > 100) {
      ctx.addIssue({ code: 'custom', message: `${label} is too long.` });
      return;
    }
    if (!NAME_PATTERN.test(value)) {
      ctx.addIssue({
        code: 'custom',
        message: `${label} can only contain letters, spaces, hyphens, apostrophes, or periods.`,
      });
    }
  }));
}

const optionalText = (max = 255) => z.preprocess(
  (value) => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
  },
  z.union([z.null(), z.string().max(max)]).optional(),
);

export const patientSchema = z.object({
  health_center_id: z.coerce.number().int().positive().optional(),
  first_name: requiredName('First name'),
  middle_name: optionalName(),
  last_name: requiredName('Last name'),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid birth date.'),
  sex: z.enum(['female', 'male', 'other'], { message: 'Select a valid sex.' }),
  contact_number: optionalText(30),
  email: z.preprocess(
    (value) => normalizeEmail(value),
    z.union([z.null(), z.string().email('Enter a valid email address.')]).optional(),
  ),
  address: z.preprocess(
    (value) => collapseName(value),
    z.string().min(2, 'Select the patient barangay.').max(255),
  ),
  address2: optionalText(255),
  city: z.preprocess(
    (value) => collapseName(value),
    z.string().min(2, 'City is required.').max(100),
  ),
  postal_code: z.preprocess(
    (value) => String(value || '').trim() || null,
    z.union([
      z.null(),
      z.string().regex(POSTAL_PATTERN, 'Postal code must be 4 digits.'),
    ]).optional(),
  ),
  province: z.preprocess(
    (value) => collapseName(value),
    z.string().min(2, 'Province is required.').max(100),
  ),
  is_senior: z.boolean().default(false),
  is_pregnant: z.boolean().default(false),
  is_pwd: z.boolean().default(false),
  is_child: z.boolean().default(false),
  is_infant: z.boolean().default(false),
  is_indigenous: z.boolean().default(false),
  is_solo_parent: z.boolean().default(false),
  medical_notes: optionalText(4000),
  emergency_contact_name: optionalName(),
  emergency_contact_number: optionalText(30),
}).superRefine((data, ctx) => {
  const age = ageFromBirthDate(data.birth_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const birth = new Date(`${data.birth_date}T00:00:00`);

  if (Number.isNaN(birth.getTime())) {
    ctx.addIssue({ code: 'custom', path: ['birth_date'], message: 'Enter a valid birth date.' });
    return;
  }
  if (birth > today) {
    ctx.addIssue({ code: 'custom', path: ['birth_date'], message: 'Birth date cannot be in the future.' });
  }
  if (age == null || age > 120) {
    ctx.addIssue({ code: 'custom', path: ['birth_date'], message: 'Enter a realistic birth date.' });
  }

  if (data.contact_number && normalizePhMobile(data.contact_number) === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['contact_number'],
      message: 'Enter a PH mobile number (+639XXXXXXXXX).',
    });
  }
  if (data.emergency_contact_number && normalizePhMobile(data.emergency_contact_number) === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['emergency_contact_number'],
      message: 'Enter a PH mobile number (+639XXXXXXXXX).',
    });
  }

  if (data.is_pregnant && data.sex !== 'female') {
    ctx.addIssue({
      code: 'custom',
      path: ['is_pregnant'],
      message: 'Pregnant can only be selected for female patients.',
    });
  }
  if (age != null) {
    if (data.is_infant && age >= 1) {
      ctx.addIssue({ code: 'custom', path: ['is_infant'], message: 'Infant applies only to patients under 1 year old.' });
    }
    if (data.is_child && (age < 1 || age >= 18)) {
      ctx.addIssue({ code: 'custom', path: ['is_child'], message: 'Child applies only to patients 1–17 years old.' });
    }
    if (data.is_senior && age < 60) {
      ctx.addIssue({ code: 'custom', path: ['is_senior'], message: 'Senior applies only to patients 60 years or older.' });
    }
  }
});

export function normalizePatientRecord(parsed) {
  const age = ageFromBirthDate(parsed.birth_date);
  return {
    ...parsed,
    first_name: collapseName(parsed.first_name),
    middle_name: collapseName(parsed.middle_name) || null,
    last_name: collapseName(parsed.last_name),
    contact_number: normalizePhMobile(parsed.contact_number) || null,
    email: normalizeEmail(parsed.email),
    address: collapseName(parsed.address),
    address2: collapseName(parsed.address2) || null,
    city: collapseName(parsed.city) || null,
    postal_code: String(parsed.postal_code || '').trim() || null,
    province: collapseName(parsed.province) || null,
    medical_notes: String(parsed.medical_notes || '').trim() || null,
    emergency_contact_name: collapseName(parsed.emergency_contact_name) || null,
    emergency_contact_number: normalizePhMobile(parsed.emergency_contact_number) || null,
    is_infant: Boolean(parsed.is_infant) || (age != null && age < 1),
    is_child: Boolean(parsed.is_child) || (age != null && age >= 1 && age < 18),
    is_senior: Boolean(parsed.is_senior) || (age != null && age >= 60),
    is_pregnant: parsed.sex === 'female' ? Boolean(parsed.is_pregnant) : false,
  };
}

export function duplicatePatientMessage(existing, reason) {
  const name = [existing.first_name, existing.last_name].filter(Boolean).join(' ') || 'This patient';
  const born = existing.birth_date ? String(existing.birth_date).slice(0, 10) : '';
  const reasonText = reason === 'contact'
    ? 'A patient with this mobile number is already registered.'
    : reason === 'email'
      ? 'A patient with this email is already registered.'
      : 'A patient with the same name and birth date is already registered.';
  return `${reasonText} ${name}${born ? ` (born ${born})` : ''} is already in the database. Do not create another record — open Patient Records to update the existing entry.`;
}
