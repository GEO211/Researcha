import { useEffect, useState } from 'react';
import { ClipboardList, Pencil, Users } from 'lucide-react';
import { api } from '../api';
import {
  ActionButton,
  AnimatedGrid,
  AnimatedGridItem,
  AnimatedPanel,
  AnimatedTableRow,
  Card,
  ExpandPanel,
  Field,
  FilterPanel,
  FlashMessage,
  FormActions,
  InlineFlash,
  PageBlock,
  PageStack,
  PrimaryButton,
  SearchableSelect,
  SelectInput,
  TabPanel,
  TableBody,
  TableHead,
  TableHeadCell,
  TableShell,
  PhPhoneInput,
  TextInput,
  useConfirm,
} from '../components/ui';
import { classNames, formatDateTime } from '../components/helpers';
import { findHealthCenterForBarangay, homeBarangayLabelForCenter, toBarangaySearchableOptions } from '../data/koronadalBarangays';
import { applyServerIssues, normalizePhMobile, validatePatientForm } from '../lib/patientValidation';
import {
  PATIENT_CLASSIFICATION_FIELDS,
  classificationTones,
  emptyPatientClassifications,
  patientClassificationTags,
} from '../data/patientClassifications';

const initialPatient = {
  first_name: '',
  middle_name: '',
  last_name: '',
  birth_date: '',
  sex: 'female',
  contact_number: '',
  email: '',
  address: '',
  address2: '',
  city: 'Koronadal City',
  postal_code: '9506',
  province: 'South Cotabato',
  ...emptyPatientClassifications,
  medical_notes: '',
  emergency_contact_name: '',
  emergency_contact_number: '',
};

function ClassificationBadges({ patient }) {
  return (
    <div className="flex flex-wrap gap-1">
      {patientClassificationTags(patient).map((tag) => (
        <span
          key={tag}
          className={classNames(
            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
            classificationTones[tag],
          )}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function patientLocationLine(patient) {
  return [patient.address2, patient.city, patient.province, patient.postal_code].filter(Boolean).join(', ');
}

function isBarangayStaff(user) {
  return user?.role === 'barangay_staff';
}

function registeringCenterName(user, healthCenters, defaultHealthCenterId) {
  const centerId = isBarangayStaff(user)
    ? user.health_center_id
    : defaultHealthCenterId;
  if (user?.health_center_name && Number(user.health_center_id) === Number(centerId)) {
    return user.health_center_name;
  }
  return healthCenters.find((center) => Number(center.id) === Number(centerId))?.name || '—';
}

function RegistrationStamp({ recordedAt, centerName }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm md:col-span-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Registration stamp</p>
      <p className="mt-0.5 font-semibold text-slate-900">{formatDateTime(recordedAt)}</p>
      <p className="text-xs text-slate-500">{centerName || 'Health center not assigned'}</p>
    </div>
  );
}

function useLiveNow(enabled = true) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return now;
}

export default function Patients({ patients, healthCenters, user, filters, setFilters, onRefresh }) {
  const [activeCategory, setActiveCategory] = useState('registration');
  const categories = [
    { id: 'registration', label: 'Patient Registration', description: 'Create new patient records', icon: Users },
    { id: 'records', label: 'Patient Records', description: 'Search, review, and update patients', icon: ClipboardList },
  ];

  return (
    <PageStack>
      <PageBlock>
        <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60">
          <AnimatedPanel className="mb-4 px-1">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Patients</h2>
            <p className="text-sm text-slate-500">Choose a patient workflow category.</p>
          </AnimatedPanel>
          <AnimatedGrid className="grid gap-3 sm:grid-cols-2">
            {categories.map((category) => {
              const Icon = category.icon;
              const isActive = activeCategory === category.id;

              return (
                <AnimatedGridItem key={category.id}>
                  <button
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    className={classNames(
                      'group w-full rounded-2xl border p-4 text-left transition',
                      isActive
                        ? 'border-cyan-200 bg-cyan-50 shadow-sm shadow-cyan-900/10'
                        : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-slate-50',
                    )}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className={classNames('rounded-xl p-2 transition', isActive ? 'bg-cyan-700 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-cyan-50 group-hover:text-cyan-700')}>
                        <Icon className="h-5 w-5" />
                      </div>
                      {isActive ? <span className="rounded-full bg-cyan-700 px-2 py-0.5 text-xs font-semibold text-white">Active</span> : null}
                    </div>
                    <p className="font-semibold text-slate-950">{category.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{category.description}</p>
                  </button>
                </AnimatedGridItem>
              );
            })}
          </AnimatedGrid>
        </section>
      </PageBlock>

      <PageBlock>
        <TabPanel panelKey={activeCategory}>
          {activeCategory === 'registration' ? (
            <PatientForm onCreated={onRefresh} healthCenters={healthCenters} user={user} />
          ) : (
            <PatientList patients={patients} healthCenters={healthCenters} user={user} filters={filters} setFilters={setFilters} onRefresh={onRefresh} />
          )}
        </TabPanel>
      </PageBlock>
    </PageStack>
  );
}

function PatientForm({ onCreated, healthCenters, user }) {
  const confirm = useConfirm();
  const [form, setForm] = useState(initialPatient);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const defaultHealthCenterId = healthCenters.find((center) => center.type === 'barangay' && center.status === 'active')?.id;
  const staffCenter = healthCenters.find((center) => Number(center.id) === Number(user?.health_center_id));
  const lockedAddress = isBarangayStaff(user) ? homeBarangayLabelForCenter(staffCenter) : '';
  const centerName = registeringCenterName(user, healthCenters, defaultHealthCenterId);
  const liveNow = useLiveNow(true);

  useEffect(() => {
    if (!lockedAddress) return undefined;
    setForm((current) => (current.address === lockedAddress ? current : { ...current, address: lockedAddress }));
    return undefined;
  }, [lockedAddress]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');

    const result = validatePatientForm(form);
    if (!result.ok) {
      setFieldErrors(result.errors);
      setError(result.summary || 'Please correct the highlighted fields before saving.');
      return;
    }

    const confirmed = await confirm({
      title: 'Save patient?',
      message: 'Register this patient in the system?',
      confirmLabel: 'Save patient',
    });
    if (!confirmed) return;

    const matchedCenter = findHealthCenterForBarangay(result.values.address, healthCenters);
    const healthCenterId = isBarangayStaff(user)
      ? user.health_center_id
      : (matchedCenter?.id || defaultHealthCenterId);

    if (!healthCenterId) {
      setError('A barangay health center is required before saving this patient.');
      return;
    }

    try {
      const created = await api('/patients', {
        method: 'POST',
        body: JSON.stringify({
          ...result.values,
          health_center_id: Number(healthCenterId),
        }),
      });
      setForm({ ...initialPatient, address: lockedAddress });
      setFieldErrors({});
      setMessage(
        `Patient registered ${formatDateTime(created.created_at)} at ${created.health_center_name || centerName}.`,
      );
      onCreated();
    } catch (err) {
      if (err.issues?.length) {
        setFieldErrors(applyServerIssues(err.issues));
      }
      setError(err.message);
    }
  }

  return (
    <Card title="Patient Registration" icon={Users}>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2" noValidate>
        <Field label="First name" error={fieldErrors.first_name}>
          <TextInput value={form.first_name} onChange={(event) => update('first_name', event.target.value)} aria-invalid={Boolean(fieldErrors.first_name)} required />
        </Field>
        <Field label="Middle name" error={fieldErrors.middle_name}>
          <TextInput value={form.middle_name} onChange={(event) => update('middle_name', event.target.value)} aria-invalid={Boolean(fieldErrors.middle_name)} />
        </Field>
        <Field label="Last name" error={fieldErrors.last_name}>
          <TextInput value={form.last_name} onChange={(event) => update('last_name', event.target.value)} aria-invalid={Boolean(fieldErrors.last_name)} required />
        </Field>
        <Field label="Birth date" error={fieldErrors.birth_date}>
          <TextInput type="date" value={form.birth_date} onChange={(event) => update('birth_date', event.target.value)} aria-invalid={Boolean(fieldErrors.birth_date)} required />
        </Field>
        <Field label="Sex" error={fieldErrors.sex}>
          <SelectInput value={form.sex} onChange={(event) => update('sex', event.target.value)}>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </SelectInput>
        </Field>
        <Field label="Contact number" error={fieldErrors.contact_number} hint="Philippine mobile: +63 then 10 digits starting with 9">
          <PhPhoneInput value={form.contact_number} onChange={(event) => update('contact_number', event.target.value)} aria-invalid={Boolean(fieldErrors.contact_number)} />
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          <TextInput type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="Optional for email reminders" aria-invalid={Boolean(fieldErrors.email)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2 md:col-span-2">
          <Field label="Emergency contact name" error={fieldErrors.emergency_contact_name}>
            <TextInput value={form.emergency_contact_name} onChange={(event) => update('emergency_contact_name', event.target.value)} aria-invalid={Boolean(fieldErrors.emergency_contact_name)} />
          </Field>
          <Field label="Emergency contact number" error={fieldErrors.emergency_contact_number}>
            <PhPhoneInput value={form.emergency_contact_number} onChange={(event) => update('emergency_contact_number', event.target.value)} aria-invalid={Boolean(fieldErrors.emergency_contact_number)} />
          </Field>
        </div>
        <Field label="Address 1" error={fieldErrors.address}>
          <SearchableSelect
            value={form.address}
            onChange={(nextValue) => update('address', nextValue)}
            options={toBarangaySearchableOptions(form.address)}
            placeholder="Select barangay"
            searchPlaceholder="Search barangay…"
            emptyMessage="No barangay matches your search"
            disabled={Boolean(lockedAddress)}
            required
          />
        </Field>
        <Field label="Address 2 (optional)">
          <TextInput value={form.address2} onChange={(event) => update('address2', event.target.value)} placeholder="Add (optional)" />
        </Field>
        <Field label="City" error={fieldErrors.city}>
          <TextInput value={form.city} onChange={(event) => update('city', event.target.value)} aria-invalid={Boolean(fieldErrors.city)} />
        </Field>
        <Field label="Postal code" error={fieldErrors.postal_code}>
          <TextInput value={form.postal_code} onChange={(event) => update('postal_code', event.target.value)} aria-invalid={Boolean(fieldErrors.postal_code)} />
        </Field>
        <Field label="Province" error={fieldErrors.province}>
          <TextInput value={form.province} onChange={(event) => update('province', event.target.value)} aria-invalid={Boolean(fieldErrors.province)} />
        </Field>
        <RegistrationStamp recordedAt={liveNow} centerName={centerName} />
        <div className="flex flex-wrap gap-3 md:col-span-2">
          {PATIENT_CLASSIFICATION_FIELDS.map(({ key, label }) => (
            <label key={key} className={classNames('flex items-center gap-2 rounded-xl px-3 py-2 text-sm', fieldErrors[key] ? 'bg-red-50 ring-1 ring-red-200' : 'bg-slate-50')}>
              <input type="checkbox" checked={form[key]} onChange={(event) => update(key, event.target.checked)} />
              {label}
            </label>
          ))}
        </div>
        {(fieldErrors.is_pregnant || fieldErrors.is_infant || fieldErrors.is_child || fieldErrors.is_senior) ? (
          <p className="text-xs font-medium text-red-600 md:col-span-2">
            {fieldErrors.is_pregnant || fieldErrors.is_infant || fieldErrors.is_child || fieldErrors.is_senior}
          </p>
        ) : null}
        <Field label="Medical notes">
          <textarea
            value={form.medical_notes}
            onChange={(event) => update('medical_notes', event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
          />
        </Field>
        <FormActions>
          <PrimaryButton>Save patient</PrimaryButton>
          <InlineFlash message={message} type="success" />
        </FormActions>
        <div className="md:col-span-2">
          <FlashMessage message={error} type="error" />
        </div>
      </form>
    </Card>
  );
}

function PatientList({ patients, healthCenters, user, filters, setFilters, onRefresh }) {
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialPatient);
  const [editError, setEditError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const barangayCenters = healthCenters.filter((center) => center.type === 'barangay');
  const editingPatient = patients.find((patient) => patient.id === editingId);
  const lockAddress = isBarangayStaff(user);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters({ q: '', city: '', province: '', contact_number: '', email: '', health_center_id: '' });
  }

  function startEdit(patient) {
    setEditingId(patient.id);
    setEditError('');
    setFieldErrors({});
    setForm({
      first_name: patient.first_name || '',
      middle_name: patient.middle_name || '',
      last_name: patient.last_name || '',
      birth_date: String(patient.birth_date || '').slice(0, 10),
      sex: patient.sex || 'female',
      contact_number: patient.contact_number || '',
      email: patient.email || '',
      address: patient.address || '',
      address2: patient.address2 || '',
      city: patient.city || '',
      postal_code: patient.postal_code || '',
      province: patient.province || '',
      ...Object.fromEntries(
        PATIENT_CLASSIFICATION_FIELDS.map(({ key }) => [key, Boolean(patient[key])]),
      ),
      medical_notes: patient.medical_notes || '',
      emergency_contact_name: patient.emergency_contact_name || '',
      emergency_contact_number: patient.emergency_contact_number || '',
    });
  }

  async function saveEdit(event) {
    event.preventDefault();
    setEditError('');

    const result = validatePatientForm(form);
    if (!result.ok) {
      setFieldErrors(result.errors);
      setEditError(result.summary || 'Please correct the highlighted fields before saving.');
      return;
    }

    const confirmed = await confirm({
      title: 'Save changes?',
      message: 'Update this patient record with your changes?',
      confirmLabel: 'Save changes',
    });
    if (!confirmed) return;

    try {
      await api(`/patients/${editingId}`, { method: 'PATCH', body: JSON.stringify(result.values) });
      setEditingId(null);
      setFieldErrors({});
      await onRefresh();
    } catch (err) {
      if (err.issues?.length) setFieldErrors(applyServerIssues(err.issues));
      setEditError(err.message);
    }
  }

  return (
    <Card title="Patient Records" icon={Users}>
      <FilterPanel
        title="Search & filter"
        description="Narrow down patient records by name, location, or health center."
        footer={(
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Clear search filters
          </button>
        )}
      >
        <Field label="Search name/location">
          <TextInput value={filters.q} onChange={(event) => updateFilter('q', event.target.value)} placeholder="Name, address, email, health center" />
        </Field>
        <Field label="City">
          <TextInput value={filters.city} onChange={(event) => updateFilter('city', event.target.value)} placeholder="Koronadal" />
        </Field>
        <Field label="Province">
          <TextInput value={filters.province} onChange={(event) => updateFilter('province', event.target.value)} placeholder="South Cotabato" />
        </Field>
        <Field label="Contact number" hint="Matches one Philippine mobile number exactly">
          <PhPhoneInput value={filters.contact_number} onChange={(event) => updateFilter('contact_number', event.target.value)} />
        </Field>
        <Field label="Email">
          <TextInput value={filters.email} onChange={(event) => updateFilter('email', event.target.value)} placeholder="patient@email.com" />
        </Field>
        <Field label="Health center">
          <SelectInput value={filters.health_center_id} onChange={(event) => updateFilter('health_center_id', event.target.value)}>
            <option value="">All health centers</option>
            {barangayCenters.map((center) => (
              <option key={center.id} value={center.id}>{center.name}</option>
            ))}
          </SelectInput>
        </Field>
      </FilterPanel>

      <ExpandPanel open={Boolean(editingId)} className="mb-6 overflow-hidden">
        <form onSubmit={saveEdit} className="overflow-hidden rounded-2xl border border-cyan-200/80 bg-cyan-50/40" noValidate>
          <div className="border-b border-cyan-100 bg-white/80 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Edit patient</p>
            <p className="text-xs text-slate-500">
              Registered {formatDateTime(editingPatient?.created_at)} at {editingPatient?.health_center_name || '—'}.
            </p>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <Field label="First name" error={fieldErrors.first_name}>
              <TextInput value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} aria-invalid={Boolean(fieldErrors.first_name)} required />
            </Field>
            <Field label="Last name" error={fieldErrors.last_name}>
              <TextInput value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} aria-invalid={Boolean(fieldErrors.last_name)} required />
            </Field>
            <Field label="Birth date" error={fieldErrors.birth_date}>
              <TextInput type="date" value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} aria-invalid={Boolean(fieldErrors.birth_date)} required />
            </Field>
            <Field label="Contact number" error={fieldErrors.contact_number}>
              <PhPhoneInput value={form.contact_number} onChange={(event) => setForm({ ...form, contact_number: event.target.value })} aria-invalid={Boolean(fieldErrors.contact_number)} />
            </Field>
            <Field label="Email" error={fieldErrors.email}>
              <TextInput type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} aria-invalid={Boolean(fieldErrors.email)} />
            </Field>
            <Field label="Address 1" error={fieldErrors.address}>
              <SearchableSelect
                value={form.address}
                onChange={(nextValue) => setForm({ ...form, address: nextValue })}
                options={toBarangaySearchableOptions(form.address)}
                placeholder="Select barangay"
                searchPlaceholder="Search barangay…"
                emptyMessage="No barangay matches your search"
                disabled={lockAddress}
                required
              />
            </Field>
            <Field label="Address 2 (optional)">
              <TextInput value={form.address2} onChange={(event) => setForm({ ...form, address2: event.target.value })} placeholder="Add (optional)" />
            </Field>
            <Field label="City" error={fieldErrors.city}>
              <TextInput value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} aria-invalid={Boolean(fieldErrors.city)} />
            </Field>
            <Field label="Postal code" error={fieldErrors.postal_code}>
              <TextInput value={form.postal_code} onChange={(event) => setForm({ ...form, postal_code: event.target.value })} aria-invalid={Boolean(fieldErrors.postal_code)} />
            </Field>
            <Field label="Province" error={fieldErrors.province}>
              <TextInput value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} aria-invalid={Boolean(fieldErrors.province)} />
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              {PATIENT_CLASSIFICATION_FIELDS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
                  <input type="checkbox" checked={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
            <div className="md:col-span-2">
              <FlashMessage message={editError} type="error" />
            </div>
            <FormActions className="border-cyan-100 bg-white/70 px-4 py-3 md:col-span-2">
              <PrimaryButton>Save changes</PrimaryButton>
              <button type="button" onClick={() => setEditingId(null)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Cancel
              </button>
            </FormActions>
          </div>
        </form>
      </ExpandPanel>

      <TableShell minWidth="960px">
        <TableHead>
          <TableHeadCell>Patient</TableHeadCell>
          <TableHeadCell>Contact</TableHeadCell>
          <TableHeadCell>Location</TableHeadCell>
          <TableHeadCell>Registered</TableHeadCell>
          <TableHeadCell>Classification</TableHeadCell>
          <TableHeadCell className="text-right">Actions</TableHeadCell>
        </TableHead>
        <TableBody>
          {patients.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center">
                <p className="text-sm font-medium text-slate-700">No patients found</p>
                <p className="mt-1 text-xs text-slate-500">Try adjusting your search filters or register a new patient.</p>
              </td>
            </tr>
          ) : patients.map((patient, index) => {
            const isEditing = editingId === patient.id;

            return (
              <AnimatedTableRow
                key={patient.id}
                index={index}
                className={classNames(
                  'transition-colors',
                  isEditing ? 'bg-cyan-50/80' : 'hover:bg-slate-50/70',
                )}
              >
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{patient.first_name} {patient.last_name}</div>
                  {patient.birth_date ? (
                    <div className="mt-0.5 text-xs text-slate-500">
                      Born {new Date(patient.birth_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="text-slate-800">{normalizePhMobile(patient.contact_number) || patient.contact_number || 'No SMS number'}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{patient.email || 'No email'}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="max-w-[220px] text-slate-800">{patient.address || '—'}</div>
                  {patientLocationLine(patient) ? (
                    <div className="mt-0.5 max-w-[220px] text-xs leading-relaxed text-slate-500">
                      {patientLocationLine(patient)}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{formatDateTime(patient.created_at)}</div>
                  <div className="mt-0.5 max-w-[220px] text-xs text-slate-500">{patient.health_center_name || '—'}</div>
                </td>
                <td className="px-4 py-3">
                  <ClassificationBadges patient={patient} />
                </td>
                <td className="px-4 py-3 text-right">
                  <ActionButton
                    variant={isEditing ? 'info' : 'neutral'}
                    icon={Pencil}
                    onClick={() => startEdit(patient)}
                  >
                    {isEditing ? 'Editing' : 'Edit'}
                  </ActionButton>
                </td>
              </AnimatedTableRow>
            );
          })}
        </TableBody>
      </TableShell>
    </Card>
  );
}
