import { useState } from 'react';
import { ClipboardList, Settings, Users } from 'lucide-react';
import { api } from '../api';
import {
  Card,
  Field,
  PageBlock,
  PageStack,
  PrimaryButton,
  SelectInput,
  SimpleTable,
  PhPhoneInput,
  TextInput,
  useConfirm,
} from '../components/ui';
import { formatDateTime, roleLabel } from '../components/helpers';
import PatientDirectory from './AdminPatients';
import { KORONADAL_BARANGAYS, barangayAddressLabel, barangayHealthCenterName } from '../data/koronadalBarangays';
import { normalizePhMobile } from '../lib/patientValidation';

export default function Admin({ section = 'users', users, patients = [], healthCenters, smsLogs, emailLogs, auditLogs, onRefresh }) {
  return (
    <PageStack replay>
      <PageBlock>
        {section === 'patients' ? <PatientDirectory patients={patients} healthCenters={healthCenters} onRefresh={onRefresh} /> : null}
        {section === 'users' ? <UserManagement users={users} healthCenters={healthCenters} onRefresh={onRefresh} /> : null}
        {section === 'centers' ? <HealthCenterManagement healthCenters={healthCenters} users={users} onRefresh={onRefresh} /> : null}
        {section === 'sms' ? <SmsLogsPanel rows={smsLogs} onRefresh={onRefresh} /> : null}
        {section === 'email' ? <LogsPanel title="Email Logs" rows={emailLogs} columns={['recipient_email', 'subject', 'status', 'trigger_type', 'created_at']} /> : null}
        {section === 'audit' ? <AuditLogsPanel rows={auditLogs} users={users} /> : null}
      </PageBlock>
    </PageStack>
  );
}

function formatListedPhone(value) {
  const normalized = normalizePhMobile(value);
  if (!normalized) return value || '—';
  const local = normalized.slice(3);
  return `+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

function StatusPill({ active, activeLabel = 'Active', inactiveLabel = 'Inactive' }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function RowActions({ onEdit, onToggle, active }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={onEdit} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
      <button type="button" onClick={onToggle} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        {active ? 'Deactivate' : 'Activate'}
      </button>
    </div>
  );
}

function UserManagement({ users, healthCenters, onRefresh }) {
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'barangay_staff', health_center_id: '', status: 'active' });
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const barangayCenters = healthCenters.filter((center) => center.type === 'barangay' && center.status === 'active');
  const cityCenters = healthCenters.filter((center) => center.type === 'city' && center.status === 'active');

  function centersForRole(role) {
    if (role === 'barangay_staff') return barangayCenters;
    if (role === 'city_staff') return cityCenters;
    return healthCenters;
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (!form.password || form.password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (form.role === 'barangay_staff' && !form.health_center_id) {
      setFormError('Assign barangay staff to a barangay health center.');
      return;
    }

    const confirmed = await confirm({
      title: 'Create user?',
      message: `Create account for ${form.email || 'this user'}?`,
      confirmLabel: 'Create user',
    });
    if (!confirmed) return;

    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          email: form.email.trim(),
          health_center_id: form.health_center_id ? Number(form.health_center_id) : null,
        }),
      });
      setForm({ name: '', email: '', password: '', role: 'barangay_staff', health_center_id: '', status: 'active' });
      await onRefresh();
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    const confirmed = await confirm({
      title: 'Update user?',
      message: `Save changes for ${editing.name}?`,
      confirmLabel: 'Save changes',
    });
    if (!confirmed) return;

    await api(`/users/${editing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: editing.name,
        email: editing.email,
        role: editing.role,
        status: editing.status,
        health_center_id: editing.health_center_id ? Number(editing.health_center_id) : null,
        ...(editing.password ? { password: editing.password } : {}),
      }),
    });
    setEditing(null);
    await onRefresh();
  }

  async function toggleStatus(user) {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    const confirmed = await confirm({
      title: nextStatus === 'disabled' ? 'Deactivate account?' : 'Activate account?',
      message: nextStatus === 'disabled'
        ? `Deactivate ${user.name || user.email}? The account stays in the record and can be activated again.`
        : `Activate ${user.name || user.email}?`,
      confirmLabel: nextStatus === 'disabled' ? 'Deactivate' : 'Activate',
      tone: nextStatus === 'disabled' ? 'danger' : 'primary',
    });
    if (!confirmed) return;

    await api(`/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    setActionError('');
    await onRefresh();
  }

  return (
    <Card title="User Management" icon={Users}>
      {editing ? (
        <form onSubmit={saveEdit} className="mb-5 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-3">
          <Field label="Name"><TextInput value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required /></Field>
          <Field label="Email"><TextInput type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} required /></Field>
          <Field label="New password"><TextInput type="password" value={editing.password || ''} onChange={(e) => setEditing({ ...editing, password: e.target.value })} placeholder="Leave blank to keep" /></Field>
          <Field label="Role">
            <SelectInput value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
              <option value="barangay_staff">Barangay Staff</option>
              <option value="city_staff">City Health Personnel</option>
              <option value="super_admin">Super Admin</option>
            </SelectInput>
          </Field>
          <Field label="Health center">
            <SelectInput value={editing.health_center_id || ''} onChange={(e) => setEditing({ ...editing, health_center_id: e.target.value })} required={editing.role === 'barangay_staff'}>
              <option value="">{editing.role === 'super_admin' ? 'No assigned center' : 'Select barangay health center'}</option>
              {centersForRole(editing.role).map((center) => (
                <option key={center.id} value={center.id}>
                  {center.barangay_name ? `Barangay ${center.barangay_name}` : center.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="flex items-end gap-2">
            <PrimaryButton>Save changes</PrimaryButton>
            <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      ) : null}

      <form onSubmit={submit} className="mb-5 grid gap-3 md:grid-cols-3" noValidate>
        <Field label="Name"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
        <Field label="Email"><TextInput type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
        <Field label="Password"><TextInput type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></Field>
        <Field label="Role">
          <SelectInput value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value, health_center_id: '' })}>
            <option value="barangay_staff">Barangay Staff</option>
            <option value="city_staff">City Health Personnel</option>
            <option value="super_admin">Super Admin</option>
          </SelectInput>
        </Field>
        <Field label="Health center">
          <SelectInput
            value={form.health_center_id}
            onChange={(event) => setForm({ ...form, health_center_id: event.target.value })}
            required={form.role === 'barangay_staff'}
          >
            <option value="">{form.role === 'super_admin' ? 'No assigned center' : 'Select barangay health center'}</option>
            {centersForRole(form.role).map((center) => (
              <option key={center.id} value={center.id}>
                {center.barangay_name ? `Barangay ${center.barangay_name} Health Center` : center.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="flex items-end md:col-span-3"><PrimaryButton>Create user</PrimaryButton></div>
        {formError ? <p className="text-sm font-medium text-red-600 md:col-span-3">{formError}</p> : null}
      </form>
      {actionError ? <p className="mb-3 text-sm font-medium text-red-600">{actionError}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90">
                {['Account', 'Role', 'Health center', 'Status', 'Actions'].map((label) => (
                  <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">No accounts yet.</td>
                </tr>
              ) : users.map((user) => (
                <tr key={user.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{roleLabel(user.role)}</td>
                  <td className="px-4 py-3 text-slate-700">{user.health_center_name || '—'}</td>
                  <td className="px-4 py-3"><StatusPill active={user.status === 'active'} inactiveLabel="Inactive" /></td>
                  <td className="px-4 py-3">
                    <RowActions
                      active={user.status === 'active'}
                      onEdit={() => setEditing({ ...user, password: '' })}
                      onToggle={() => toggleStatus(user)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

const CITY_CENTER_NAME = 'Koronadal City Health Center';
const CITY_ADDRESS = 'Koronadal City, South Cotabato';

function centerFormFrom(center) {
  const type = center?.type || 'barangay';
  return {
    name: center?.name || (type === 'city' ? CITY_CENTER_NAME : ''),
    type,
    address: type === 'city' ? (center?.address || CITY_ADDRESS) : (center?.address || ''),
    contact_number: center?.contact_number || '',
    status: center?.status || 'active',
    barangay_name: center?.barangay_name || '',
  };
}

function asCityCenter(current) {
  const fromBarangay = Boolean(current.barangay_name)
    || String(current.name || '').startsWith('Barangay ')
    || String(current.address || '').startsWith('Barangay ');
  return {
    ...current,
    type: 'city',
    barangay_name: '',
    name: fromBarangay || !String(current.name || '').trim() ? CITY_CENTER_NAME : current.name,
    address: CITY_ADDRESS,
  };
}

function HealthCenterManagement({ healthCenters, users = [], onRefresh }) {
  const confirm = useConfirm();
  const [form, setForm] = useState(centerFormFrom());
  const [editing, setEditing] = useState(null);
  const [actionError, setActionError] = useState('');
  const barangayCount = healthCenters.filter((center) => center.type === 'barangay').length;
  const cityCount = healthCenters.filter((center) => center.type === 'city').length;
  const sortedCenters = [...healthCenters].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'city' ? -1 : 1;
    return String(a.barangay_name || a.name).localeCompare(String(b.barangay_name || b.name));
  });

  function payloadFrom(values) {
    const rawContact = String(values.contact_number || '').trim();
    const contact = rawContact ? normalizePhMobile(rawContact) : null;
    if (rawContact && !contact) {
      throw new Error('Enter a PH mobile number (+639XXXXXXXXX).');
    }
    return {
      name: values.type === 'city' ? (values.name || CITY_CENTER_NAME) : values.name,
      type: values.type,
      address: values.type === 'city' ? CITY_ADDRESS : values.address,
      contact_number: contact,
      status: values.status,
      barangay_name: values.type === 'barangay' ? (values.barangay_name || null) : null,
    };
  }

  function applyBarangay(name, setValues) {
    setValues((current) => ({
      ...current,
      type: 'barangay',
      barangay_name: name,
      name: name ? barangayHealthCenterName(name) : current.name,
      address: name ? `${barangayAddressLabel(name)}, Koronadal City, South Cotabato` : current.address,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    let payload;
    try {
      payload = payloadFrom(form);
    } catch (error) {
      return;
    }
    const confirmed = await confirm({
      title: 'Add health center?',
      message: `Add ${form.name || 'this health center'} to the system?`,
      confirmLabel: 'Add center',
    });
    if (!confirmed) return;

    await api('/health-centers', { method: 'POST', body: JSON.stringify(payload) });
    setForm(centerFormFrom());
    await onRefresh();
  }

  async function saveEdit(event) {
    event.preventDefault();
    let payload;
    try {
      payload = payloadFrom(editing);
    } catch (error) {
      return;
    }
    const confirmed = await confirm({
      title: 'Update health center?',
      message: `Save all details for ${editing.name}?`,
      confirmLabel: 'Save changes',
    });
    if (!confirmed) return;

    await api(`/health-centers/${editing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setEditing(null);
    await onRefresh();
  }

  async function toggleStatus(center) {
    const nextStatus = center.status === 'active' ? 'inactive' : 'active';
    const confirmed = await confirm({
      title: nextStatus === 'inactive' ? 'Deactivate center?' : 'Activate center?',
      message: nextStatus === 'inactive'
        ? `Deactivate ${center.name}? Patient and referral history stays on record.`
        : `Activate ${center.name}?`,
      confirmLabel: nextStatus === 'inactive' ? 'Deactivate' : 'Activate',
      tone: nextStatus === 'inactive' ? 'danger' : 'primary',
    });
    if (!confirmed) return;

    await api(`/health-centers/${center.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    setActionError('');
    await onRefresh();
  }

  async function removeCenter(center) {
    const confirmed = await confirm({
      title: 'Delete health center?',
      message: `Delete ${center.name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api(`/health-centers/${center.id}`, { method: 'DELETE' });
      if (editing?.id === center.id) setEditing(null);
      setActionError('');
      await onRefresh();
    } catch (error) {
      setActionError(error.message);
    }
  }

  function renderFields(values, setValues) {
    const isBarangay = values.type === 'barangay';
    const contactInvalid = Boolean(String(values.contact_number || '').trim() && !normalizePhMobile(values.contact_number));
    return (
      <>
        <Field label="Type">
          <SelectInput
            value={values.type}
            onChange={(event) => {
              const nextType = event.target.value;
              setValues((current) => (
                nextType === 'barangay' ? { ...current, type: 'barangay' } : asCityCenter(current)
              ));
            }}
          >
            <option value="barangay">Barangay</option>
            <option value="city">City</option>
          </SelectInput>
        </Field>
        {isBarangay ? (
          <Field label="Barangay">
            <SelectInput
              value={values.barangay_name}
              onChange={(event) => applyBarangay(event.target.value, setValues)}
              required
            >
              <option value="">Select Koronadal barangay</option>
              {KORONADAL_BARANGAYS.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </SelectInput>
          </Field>
        ) : null}
        <Field
          label="Contact number"
          error={contactInvalid ? 'Enter a PH mobile number (+639XXXXXXXXX).' : ''}
          hint="Philippine mobile: +63 then 10 digits starting with 9"
        >
          <PhPhoneInput
            value={values.contact_number}
            onChange={(event) => setValues((current) => ({ ...current, contact_number: event.target.value }))}
            aria-invalid={contactInvalid}
          />
        </Field>
        <Field label="Status">
          <SelectInput value={values.status} onChange={(event) => setValues((current) => ({ ...current, status: event.target.value }))}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectInput>
        </Field>
        {isBarangay && values.barangay_name ? (
          <p className="text-sm text-slate-600 md:col-span-2 xl:col-span-4">{values.address}</p>
        ) : null}
        {!isBarangay ? (
          <p className="text-sm text-slate-600 md:col-span-2 xl:col-span-4">{values.name || CITY_CENTER_NAME}. {CITY_ADDRESS}.</p>
        ) : null}
      </>
    );
  }

  return (
    <Card title="Health Centers" icon={Settings}>
      <p className="mb-4 text-sm text-slate-500">
        {barangayCount} barangay health centers · {cityCount} city health center{cityCount === 1 ? '' : 's'} · {healthCenters.length} total
      </p>

      {editing ? (
        <form onSubmit={saveEdit} className="mb-5 space-y-4 rounded-2xl bg-slate-50 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {renderFields(editing, setEditing)}
          </div>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton>Save changes</PrimaryButton>
            <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
          </div>
        </form>
      ) : (
        <form onSubmit={submit} className="mb-5 space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {renderFields(form, setForm)}
          </div>
          <PrimaryButton>Add center</PrimaryButton>
        </form>
      )}

      {actionError ? <p className="mb-3 text-sm font-medium text-red-600">{actionError}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90">
                {['Center', 'Contact', 'Status', 'Staff', 'Actions'].map((label) => (
                  <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedCenters.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">No health centers found.</td>
                </tr>
              ) : sortedCenters.map((center) => {
                const staff = users.filter((user) => Number(user.health_center_id) === Number(center.id));
                return (
                  <tr key={center.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{center.name || '—'}</p>
                      <p className="text-xs text-slate-500">
                        {center.type === 'city' ? 'City' : `Barangay${center.barangay_name ? ` · ${center.barangay_name}` : ''}`}
                        {center.address ? ` · ${center.address}` : ''}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatListedPhone(center.contact_number)}</td>
                    <td className="px-4 py-3"><StatusPill active={center.status === 'active'} /></td>
                    <td className="px-4 py-3 text-slate-700">
                      {staff.length ? staff.map((user) => user.name).join(', ') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <RowActions
                        active={center.status === 'active'}
                        onEdit={() => { setActionError(''); setEditing({ id: center.id, ...centerFormFrom(center) }); }}
                        onToggle={() => toggleStatus(center)}
                        onDelete={() => removeCenter(center)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function smsWhen(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function smsReason(value) {
  return {
    referral_booked: 'Referral booked',
    referral_transferred: 'Checkup transferred',
    referral_rescheduled: 'Appointment rescheduled',
    referral_cancelled: 'Booking canceled',
    referral_completed: 'Visit completed',
    approval: 'Referral approved',
    appointment_reminder: 'Appointment reminder',
    missed_referral: 'Missed visit',
    queue_call: 'Queue call',
    manual: 'Manual message',
  }[value] || String(value || '—').replaceAll('_', ' ');
}

function SmsLogsPanel({ rows, onRefresh }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const logs = rows || [];

  async function clearLogs() {
    const confirmed = await confirm({
      title: 'Clear SMS logs?',
      message: `Remove all ${logs.length} SMS log${logs.length === 1 ? '' : 's'}? This cannot be undone.`,
      confirmLabel: 'Clear logs',
      tone: 'danger',
    });
    if (!confirmed) return;

    setBusy(true);
    setError('');
    try {
      await api('/sms-logs', { method: 'DELETE' });
      if (onRefresh) await onRefresh();
    } catch (err) {
      setError(err.message || 'Could not clear SMS logs.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="SMS Logs" icon={ClipboardList}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{logs.length} message{logs.length === 1 ? '' : 's'}</p>
        <button
          type="button"
          onClick={clearLogs}
          disabled={!logs.length || busy}
          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Clearing…' : 'Clear logs'}
        </button>
      </div>
      {error ? <p className="mb-4 text-sm font-medium text-red-600">{error}</p> : null}
      {logs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No SMS messages yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">When</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">To</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Why</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="align-top hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{smsWhen(log.sent_at || log.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{log.recipient_number || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{smsReason(log.trigger_type)}</td>
                    <td className="whitespace-nowrap px-4 py-3 capitalize text-slate-700">{log.status || '—'}</td>
                    <td className="min-w-[280px] px-4 py-3 text-slate-800">
                      <p className="whitespace-pre-wrap break-words">{log.message || '—'}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

function auditActionLabel(value) {
  return {
    'auth.login': 'Signed in',
    'auth.profile_updated': 'Updated profile',
    'auth.password_changed': 'Changed password',
    'patient.created': 'Created patient',
    'patient.updated': 'Updated patient',
    'patient.archived': 'Archived patient',
    'patient.restored': 'Restored patient',
    'patient.transferred': 'Transferred patient',
    'referral.archive_finished': 'Archived finished referrals',
    'referral.submitted': 'Submitted referral',
    'referral.transferred': 'Transferred checkup',
    'referral.under_review': 'Moved referral to review',
    'referral.approved': 'Approved referral',
    'referral.rejected': 'Rejected referral',
    'referral.completed': 'Completed visit',
    'referral.missed': 'Marked visit missed',
    'referral.cancelled': 'Canceled referral',
    'referral.appointment_scheduled': 'Scheduled appointment',
    'referral.invalid_queue_number': 'Invalid queue number',
    'referral.archived': 'Archived referral',
    'user.created': 'Created account',
    'user.updated': 'Updated account',
    'user.deleted': 'Deleted account',
    'health_center.created': 'Added health center',
    'health_center.updated': 'Updated health center',
    'health_center.deleted': 'Deleted health center',
    'setting.updated': 'Updated setting',
    'priority_rule.updated': 'Updated priority rule',
    'sms.manual_sent': 'Sent SMS',
    'sms.logs_cleared': 'Cleared SMS logs',
    'queue.called': 'Called patient',
  }[value] || String(value || '—').replaceAll('.', ' ').replaceAll('_', ' ');
}

function auditDetail(log) {
  if (log?.detail) return log.detail;
  const values = log?.new_values && typeof log.new_values === 'object' ? log.new_values : null;
  if (!values) return '';
  const reason = values.reason || '';
  const note = values.note || '';
  if (reason || note) return [reason, note].filter(Boolean).join(' — ');
  if (values.from_center && values.to_center) return `${values.from_center} to ${values.to_center}`;
  return '';
}

const AUDIT_GROUPS = [
  { id: 'all', label: 'All' },
  { id: 'patient', label: 'Patients' },
  { id: 'referral', label: 'Referrals' },
  { id: 'user', label: 'Accounts' },
  { id: 'health_center', label: 'Centers' },
  { id: 'auth.login', label: 'Sign-ins' },
];

function auditGroup(log) {
  if (log.action === 'auth.login') return 'auth.login';
  return log.auditable_type || '';
}

function auditEntityLabel(log) {
  const type = {
    referral: 'Referral',
    patient: 'Patient',
    user: 'Account',
    health_center: 'Health center',
    system_setting: 'System setting',
    priority_rule: 'Priority rule',
    queue_entry: 'Queue',
  }[log.auditable_type] || String(log.auditable_type || '—').replaceAll('_', ' ');
  if (log.record_label) return log.record_label;
  if (!log.auditable_id) return type;
  return `${type} #${log.auditable_id}`;
}

function auditAccount(log, users) {
  const match = (users || []).find((user) => Number(user.id) === Number(log.user_id));
  const name = log.user_name || match?.name || '';
  const email = log.user_email || match?.email || '';
  return {
    name: name || '—',
    email: email || '—',
    actor: name || 'System',
  };
}

function AuditLogsPanel({ rows, users }) {
  const [group, setGroup] = useState('all');
  const [query, setQuery] = useState('');
  const logs = (rows || []).filter((log) => {
    if (group !== 'all' && auditGroup(log) !== group) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    const account = auditAccount(log, users);
    return [account.name, account.email, auditActionLabel(log.action), auditEntityLabel(log), auditDetail(log)]
      .some((value) => String(value || '').toLowerCase().includes(needle));
  });
  const counts = AUDIT_GROUPS.map((item) => ({
    ...item,
    count: item.id === 'all'
      ? (rows || []).length
      : (rows || []).filter((log) => auditGroup(log) === item.id).length,
  }));

  return (
    <Card title="Audit Logs" icon={ClipboardList}>
      <p className="mb-4 text-sm text-slate-500">Who did what, with the time and the record that changed.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {counts.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setGroup(item.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${group === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {item.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${group === item.id ? 'bg-white/15 text-white' : 'bg-white text-slate-500'}`}>{item.count}</span>
          </button>
        ))}
      </div>
      <label className="mb-4 block max-w-md">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Search</span>
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, action, or record" />
      </label>
      {logs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          {(rows || []).length === 0 ? 'No audit records yet.' : 'No audit records match this view.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Account name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Account email</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Timestamp</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Action</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Entity</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Actor name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const account = auditAccount(log, users);
                  return (
                    <tr key={log.id} className="align-top hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{account.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{account.email}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-800">{smsWhen(log.created_at)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <p className="whitespace-nowrap">{auditActionLabel(log.action)}</p>
                        {auditDetail(log) ? <p className="mt-0.5 max-w-[16rem] text-xs text-slate-500">{auditDetail(log)}</p> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{auditEntityLabel(log)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-800">{account.actor}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

function LogsPanel({ title, rows, columns }) {
  return (
    <Card title={title} icon={ClipboardList}>
      <SimpleTable rows={rows} columns={columns} />
    </Card>
  );
}
