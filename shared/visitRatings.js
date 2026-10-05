export const RATING_LABELS = {
  1: 'Very Poor',
  2: 'Poor',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

export const RATING_CATEGORIES = [
  { key: 'staff', label: 'Staff accommodation' },
  { key: 'service', label: 'Service quality' },
  { key: 'waiting_time', label: 'Waiting time' },
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'overall', label: 'Overall experience' },
];

export const RATING_INTERNAL_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'needs_attention', label: 'Needs Attention' },
  { value: 'resolved', label: 'Resolved' },
];

export const SERVICE_LABELS = {
  routine: 'General Consultation',
  follow_up: 'Follow-up',
  specialist_consultation: 'Specialist consultation',
  emergency: 'Emergency',
};

export function serviceLabel(type) {
  return SERVICE_LABELS[type] || 'Medical Consultation';
}

export function parseCategories(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return parseCategories(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (typeof value !== 'object') return {};
  const out = {};
  for (const { key } of RATING_CATEGORIES) {
    const score = Number(value[key]);
    if (Number.isInteger(score) && score >= 1 && score <= 5) out[key] = score;
  }
  return out;
}

export function sanitizeCategories(value) {
  return parseCategories(value);
}

export function defaultInternalStatus(rating) {
  return Number(rating) <= 2 ? 'needs_attention' : 'new';
}

export function patientDisplayLabel(firstName, lastName) {
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  if (!first && !last) return 'Patient';
  if (!last) return first;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}
