/** Official 27 barangays of Koronadal City (koronadal.gov.ph). */
export const KORONADAL_BARANGAYS = [
  'Assumption',
  'Avanceña',
  'Cacub',
  'Caloocan',
  'Carpenter Hill',
  'Concepcion',
  'Esperanza',
  'General Paulino Santos',
  'Mabini',
  'Magsaysay',
  'Mambucal',
  'Morales',
  'Namnama',
  'New Pangasinan',
  'Paraiso',
  'Rotonda',
  'San Isidro',
  'San Jose',
  'San Roque',
  'Santa Cruz',
  'Santo Niño',
  'Saravia',
  'Topland',
  'Zone I',
  'Zone II',
  'Zone III',
  'Zone IV',
];

const BARANGAY_ALIASES = {
  'sta cruz': 'Santa Cruz',
  'sta. cruz': 'Santa Cruz',
  'gps': 'General Paulino Santos',
  'general p. santos': 'General Paulino Santos',
  'gen. paulino santos': 'General Paulino Santos',
};

export function barangayAddressLabel(name) {
  return `Barangay ${name}`;
}

export function barangayHealthCenterName(name) {
  return `Barangay ${name} Health Center`;
}

export function normalizeBarangayKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^brgy\.?\s+/i, '')
    .replace(/^barangay\s+/i, '')
    .replace(/\s+health\s+center$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function matchBarangayName(value) {
  const key = normalizeBarangayKey(value);
  if (!key) return null;
  const aliased = BARANGAY_ALIASES[key];
  if (aliased) return aliased;
  return KORONADAL_BARANGAYS.find((name) => normalizeBarangayKey(name) === key) || null;
}

export function homeBarangayLabelForCenter(center) {
  const barangay = matchBarangayName(center?.barangay_name || center?.name || center?.address);
  return barangay ? barangayAddressLabel(barangay) : '';
}

export function findHealthCenterForBarangay(value, healthCenters = []) {
  const barangay = matchBarangayName(value);
  if (!barangay) return null;
  const key = normalizeBarangayKey(barangay);
  return healthCenters.find((center) => {
    if (center.status && center.status !== 'active') return false;
    if (matchBarangayName(center.barangay_name) === barangay) return true;
    if (matchBarangayName(center.name) === barangay) return true;
    const addressKey = normalizeBarangayKey(center.address);
    return addressKey === key || addressKey.startsWith(`${key} `);
  }) || null;
}

export function barangaySelectOptions(currentValue = '') {
  const options = KORONADAL_BARANGAYS.map((name) => barangayAddressLabel(name));
  const value = String(currentValue || '').trim();
  if (value && !options.includes(value)) options.unshift(value);
  return options;
}

export function toBarangaySearchableOptions(currentValue = '') {
  return barangaySelectOptions(currentValue).map((label) => ({
    value: label,
    label,
    searchText: label,
  }));
}
