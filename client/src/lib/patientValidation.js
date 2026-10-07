import { EMAIL_PROVIDER_MESSAGE, isRecognizedEmail } from '@shared/emailProviders';

const NAME_PATTERN = /^[\p{L}\p{M}\s.'-]+$/u;
const POSTAL_PATTERN = /^\d{4}$/;

export function collapseName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function normalizeEmail(value) {
  const trimmed = String(value || '').trim().toLowerCase();
  return trimmed || '';
}

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

const PH_MOBILE_MESSAGE = 'Enter a PH mobile number (+639XXXXXXXXX).';

export function phMobileDigits(value) {
  const digits = digitsOnly(value);
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^639\d{9}$/.test(digits)) return digits;
  if (/^9\d{9}$/.test(digits)) return `63${digits}`;
  return null;
}

export function phSubscriberDigits(value) {
  let digits = digitsOnly(value);
  if (digits.startsWith('63')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  const start = digits.indexOf('9');
  if (start === -1) return '';
  return digits.slice(start, start + 10);
}

export function normalizePhMobile(value) {
  if (!String(value || '').trim()) return '';
  const digits = phMobileDigits(value);
  return digits ? `+${digits}` : null;
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

export const AGE_CLASSIFICATION_KEYS = ['is_infant', 'is_child', 'is_senior'];

export function classificationsFromBirthDate(birthDate) {
  const age = ageFromBirthDate(String(birthDate || '').slice(0, 10));
  return {
    is_infant: age != null && age < 1,
    is_child: age != null && age >= 1 && age < 18,
    is_senior: age != null && age >= 60,
  };
}

function setError(errors, key, message) {
  if (!errors[key]) errors[key] = message;
}

export function validatePatientForm(form, { requireContact = false } = {}) {
  const errors = {};
  const first_name = collapseName(form.first_name);
  const middle_name = collapseName(form.middle_name);
  const last_name = collapseName(form.last_name);
  const birth_date = String(form.birth_date || '').trim();
  const address = collapseName(form.address);
  const city = collapseName(form.city);
  const province = collapseName(form.province);
  const postal_code = String(form.postal_code || '').trim();
  const email = normalizeEmail(form.email);
  const contact = normalizePhMobile(form.contact_number);
  const emergencyNumber = normalizePhMobile(form.emergency_contact_number);
  const emergencyName = collapseName(form.emergency_contact_name);

  if (!first_name) setError(errors, 'first_name', 'First name is required.');
  else if (first_name.length < 3) setError(errors, 'first_name', 'First name must be at least 3 characters.');
  else if (!NAME_PATTERN.test(first_name)) setError(errors, 'first_name', 'First name can only contain letters, spaces, hyphens, apostrophes, or periods.');

  if (middle_name && !NAME_PATTERN.test(middle_name)) {
    setError(errors, 'middle_name', 'Middle name can only contain letters, spaces, hyphens, apostrophes, or periods.');
  }

  if (!last_name) setError(errors, 'last_name', 'Last name is required.');
  else if (last_name.length < 3) setError(errors, 'last_name', 'Last name must be at least 3 characters.');
  else if (!NAME_PATTERN.test(last_name)) setError(errors, 'last_name', 'Last name can only contain letters, spaces, hyphens, apostrophes, or periods.');

  if (!birth_date) setError(errors, 'birth_date', 'Birth date is required.');
  else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const birth = new Date(`${birth_date}T00:00:00`);
    const age = ageFromBirthDate(birth_date);
    if (Number.isNaN(birth.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(birth_date)) {
      setError(errors, 'birth_date', 'Enter a valid birth date.');
    } else if (birth > today) {
      setError(errors, 'birth_date', 'Birth date cannot be in the future.');
    } else if (age == null || age > 120) {
      setError(errors, 'birth_date', 'Enter a realistic birth date.');
    }
  }

  if (!['female', 'male', 'other'].includes(form.sex)) {
    setError(errors, 'sex', 'Select a valid sex.');
  }

  if (requireContact && !String(form.contact_number || '').trim()) {
    setError(errors, 'contact_number', 'Mobile number is required.');
  } else if (String(form.contact_number || '').trim() && contact === null) {
    setError(errors, 'contact_number', PH_MOBILE_MESSAGE);
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError(errors, 'email', 'Enter a valid email address.');
  } else if (email && !isRecognizedEmail(email)) {
    setError(errors, 'email', EMAIL_PROVIDER_MESSAGE);
  }

  if (!address) setError(errors, 'address', 'Select the patient barangay.');
  if (!city) setError(errors, 'city', 'City is required.');
  if (!province) setError(errors, 'province', 'Province is required.');
  if (postal_code && !POSTAL_PATTERN.test(postal_code)) {
    setError(errors, 'postal_code', 'Postal code must be 4 digits.');
  }

  if (emergencyName && !NAME_PATTERN.test(emergencyName)) {
    setError(errors, 'emergency_contact_name', 'Use letters only for the emergency contact name.');
  }
  if (String(form.emergency_contact_number || '').trim() && emergencyNumber === null) {
    setError(errors, 'emergency_contact_number', PH_MOBILE_MESSAGE);
  }

  const age = ageFromBirthDate(birth_date);
  if (form.is_pregnant && form.sex !== 'female') {
    setError(errors, 'is_pregnant', 'Pregnant can only be selected for female patients.');
  }
  if (age != null) {
    if (form.is_infant && age >= 1) setError(errors, 'is_infant', 'Infant applies only to patients under 1 year old.');
    if (form.is_child && (age < 1 || age >= 18)) setError(errors, 'is_child', 'Child applies only to patients 1–17 years old.');
    if (form.is_senior && age < 60) setError(errors, 'is_senior', 'Senior applies only to patients 60 years or older.');
  }

  const values = {
    ...form,
    first_name,
    middle_name,
    last_name,
    birth_date,
    contact_number: contact || '',
    email,
    address,
    address2: collapseName(form.address2),
    city,
    postal_code,
    province,
    emergency_contact_name: emergencyName,
    emergency_contact_number: emergencyNumber || '',
  };

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    values,
    summary: Object.values(errors)[0] || '',
  };
}

export function applyServerIssues(issues = []) {
  const errors = {};
  for (const issue of issues) {
    const field = issue.field || issue.path || '';
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
