export const PATIENT_CLASSIFICATION_FIELDS = [
  { key: 'is_senior', label: 'Senior citizen', shortLabel: 'Senior', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  { key: 'is_pregnant', label: 'Pregnant', shortLabel: 'Pregnant', tone: 'bg-pink-50 text-pink-800 ring-pink-200' },
  { key: 'is_pwd', label: 'PWD', shortLabel: 'PWD', tone: 'bg-violet-50 text-violet-800 ring-violet-200' },
  { key: 'is_child', label: 'Child', shortLabel: 'Child', tone: 'bg-sky-50 text-sky-800 ring-sky-200' },
  { key: 'is_infant', label: 'Infant', shortLabel: 'Infant', tone: 'bg-cyan-50 text-cyan-800 ring-cyan-200' },
  { key: 'is_indigenous', label: 'Indigenous (IP)', shortLabel: 'IP', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  { key: 'is_solo_parent', label: 'Solo parent', shortLabel: 'Solo parent', tone: 'bg-orange-50 text-orange-800 ring-orange-200' },
];

export const emptyPatientClassifications = Object.fromEntries(
  PATIENT_CLASSIFICATION_FIELDS.map((field) => [field.key, false]),
);

export function patientClassificationTags(patient) {
  const tags = PATIENT_CLASSIFICATION_FIELDS
    .filter((field) => patient?.[field.key])
    .map((field) => field.shortLabel);
  return tags.length ? tags : ['Standard'];
}

export const classificationTones = {
  Standard: 'bg-slate-100 text-slate-600 ring-slate-200',
  ...Object.fromEntries(PATIENT_CLASSIFICATION_FIELDS.map((field) => [field.shortLabel, field.tone])),
};
