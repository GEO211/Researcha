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
  TextInput,
  useConfirm,
} from '../components/ui';
import { formatDateTime, roleLabel } from '../components/helpers';
import { KORONADAL_BARANGAYS, barangayAddressLabel, barangayHealthCenterName } from '../data/koronadalBarangays';

export default function Admin({ section = 'users', users, healthCenters, settingsData, smsLogs, emailLogs, auditLogs, onRefresh }) {
  const auditRows = (auditLogs || []).map((log) => ({
    ...log,
    actor_name: log.user_name || 'System',
    entity_type: log.auditable_type || '—',
    entity_id: log.auditable_id || '—',
  }));

  return (
    <PageStack>
      <PageBlock>
        {section === 'users' ? <UserManagement users={users} healthCenters={healthCenters} onRefresh={onRefresh} /> : null}
        {section === 'centers' ? <HealthCenterManagement healthCenters={healthCenters} users={users} onRefresh={onRefresh} /> : null}
        {section === 'settings' ? <SystemSettings settingsData={settingsData} onRefresh={onRefresh} /> : null}
        {section === 'sms' ? <SmsLogsPanel rows={smsLogs} /> : null}
        {section === 'email' ? <LogsPanel title="Email Logs" rows={emailLogs} columns={['recipient_email', 'subject', 'status', 'trigger_type', 'created_at']} /> : null}
        {section === 'audit' ? <LogsPanel title="Audit Logs" rows={auditRows} columns={['actor_name', 'action', 'entity_type', 'entity_id', 'created_at']} /> : null}
      </PageBlock>
    </PageStack>
  );
}

function UserManagement({ users, healthCenters, onRefresh }) {
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'barangay_staff', health_center_id: '', status: 'active' });
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState('');
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
      title: nextStatus === 'disabled' ? 'Disable user?' : 'Enable user?',
      message: `${nextStatus === 'disabled' ? 'Disable' : 'Enable'} ${user.name || user.email}?`,
      confirmLabel: nextStatus === 'disabled' ? 'Disable' : 'Enable',
      tone: nextStatus === 'disabled' ? 'danger' : 'primary',
    });
    if (!confirmed) return;

    await api(`/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
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
        <div className="flex items-end"><PrimaryButton>Create user</PrimaryButton></div>
        {formError ? <p className="text-sm font-medium text-red-600 md:col-span-3">{formError}</p> : null}
      </form>
      <SimpleTable
        rows={users.map((user) => ({ ...user, role: roleLabel(user.role) }))}
        columns={['name', 'email', 'role', 'health_center_name', 'status']}
        renderActions={(user) => (
          <div className="flex gap-2">
            <button className="text-cyan-700" type="button" onClick={() => setEditing({ ...user, password: '' })}>Edit</button>
            <button className="text-cyan-700" type="button" onClick={() => toggleStatus(user)}>{user.status === 'active' ? 'Disable' : 'Enable'}</button>
          </div>
        )}
      />
    </Card>
  );
}

function centerFormFrom(center) {
  return {
    name: center?.name || '',
    type: center?.type || 'barangay',
    address: center?.address || '',
    contact_number: center?.contact_number || '',
    status: center?.status || 'active',
    barangay_name: center?.barangay_name || '',
  };
}

function HealthCenterManagement({ healthCenters, users = [], onRefresh }) {
  const confirm = useConfirm();
  const [form, setForm] = useState(centerFormFrom());
  const [editing, setEditing] = useState(null);
  const barangayCount = healthCenters.filter((center) => center.type === 'barangay').length;
  const cityCount = healthCenters.filter((center) => center.type === 'city').length;
  const sortedCenters = [...healthCenters].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'city' ? -1 : 1;
    return String(a.barangay_name || a.name).localeCompare(String(b.barangay_name || b.name));
  });

  function payloadFrom(values) {
    return {
      name: values.name,
      type: values.type,
      address: values.address,
      contact_number: values.contact_number || null,
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
    const confirmed = await confirm({
      title: 'Add health center?',
      message: `Add ${form.name || 'this health center'} to the system?`,
      confirmLabel: 'Add center',
    });
    if (!confirmed) return;

    await api('/health-centers', { method: 'POST', body: JSON.stringify(payloadFrom(form)) });
    setForm(centerFormFrom());
    await onRefresh();
  }

  async function saveEdit(event) {
    event.preventDefault();
    const confirmed = await confirm({
      title: 'Update health center?',
      message: `Save all details for ${editing.name}?`,
      confirmLabel: 'Save changes',
    });
    if (!confirmed) return;

    await api(`/health-centers/${editing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payloadFrom(editing)),
    });
    setEditing(null);
    await onRefresh();
  }

  async function toggleStatus(center) {
    const nextStatus = center.status === 'active' ? 'inactive' : 'active';
    const confirmed = await confirm({
      title: nextStatus === 'inactive' ? 'Deactivate center?' : 'Activate center?',
      message: `${nextStatus === 'inactive' ? 'Deactivate' : 'Activate'} ${center.name}?`,
      confirmLabel: nextStatus === 'inactive' ? 'Deactivate' : 'Activate',
      tone: nextStatus === 'inactive' ? 'danger' : 'primary',
    });
    if (!confirmed) return;

    await api(`/health-centers/${center.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    await onRefresh();
  }

  function renderFields(values, setValues) {
    return (
      <>
        <Field label="Type">
          <SelectInput
            value={values.type}
            onChange={(event) => setValues((current) => ({
              ...current,
              type: event.target.value,
              barangay_name: event.target.value === 'barangay' ? current.barangay_name : '',
            }))}
          >
            <option value="barangay">Barangay</option>
            <option value="city">City</option>
          </SelectInput>
        </Field>
        <Field label="Barangay">
          <SelectInput
            value={values.barangay_name}
            onChange={(event) => applyBarangay(event.target.value, setValues)}
            disabled={values.type !== 'barangay'}
            required={values.type === 'barangay'}
          >
            <option value="">Select Koronadal barangay</option>
            {KORONADAL_BARANGAYS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Name">
          <TextInput value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} required />
        </Field>
        <Field label="Contact number">
          <TextInput value={values.contact_number} onChange={(event) => setValues((current) => ({ ...current, contact_number: event.target.value }))} placeholder="Optional" />
        </Field>
        <Field label="Status">
          <SelectInput value={values.status} onChange={(event) => setValues((current) => ({ ...current, status: event.target.value }))}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectInput>
        </Field>
        <Field label="Address">
          <TextInput value={values.address} onChange={(event) => setValues((current) => ({ ...current, address: event.target.value }))} required />
        </Field>
      </>
    );
  }

  return (
    <Card title="Health Centers" icon={Settings}>
      <p className="mb-4 text-sm text-slate-500">
        {barangayCount} barangay health centers · {cityCount} city health center{cityCount === 1 ? '' : 's'} · {healthCenters.length} total
      </p>

      {editing ? (
        <form onSubmit={saveEdit} className="mb-5 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-3">
          {renderFields(editing, setEditing)}
          <div className="flex items-end gap-2 md:col-span-3">
            <PrimaryButton>Save changes</PrimaryButton>
            <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      ) : (
        <form onSubmit={submit} className="mb-5 grid gap-3 md:grid-cols-3">
          {renderFields(form, setForm)}
          <div className="flex items-end"><PrimaryButton>Add center</PrimaryButton></div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90">
                {['ID', 'Name', 'Type', 'Barangay', 'Address', 'Contact', 'Status', 'Assigned staff', 'Created', 'Updated', 'Actions'].map((label) => (
                  <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedCenters.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500">No health centers found.</td>
                </tr>
              ) : sortedCenters.map((center) => {
                const staff = users.filter((user) => Number(user.health_center_id) === Number(center.id));
                return (
                  <tr key={center.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{center.id}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{center.name || '—'}</td>
                    <td className="px-4 py-3 capitalize text-slate-700">{center.type || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{center.barangay_name || '—'}</td>
                    <td className="max-w-xs px-4 py-3 whitespace-normal text-slate-700">{center.address || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{center.contact_number || '—'}</td>
                    <td className="px-4 py-3 capitalize text-slate-700">{center.status || '—'}</td>
                    <td className="max-w-[220px] px-4 py-3 whitespace-normal text-slate-700">
                      {staff.length ? staff.map((user) => `${user.name} (${roleLabel(user.role)})`).join(', ') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDateTime(center.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDateTime(center.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <button className="text-left text-cyan-700" type="button" onClick={() => setEditing({ id: center.id, ...centerFormFrom(center) })}>Edit</button>
                        <button className="text-left text-cyan-700" type="button" onClick={() => toggleStatus(center)}>
                          {center.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
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

function SystemSettings({ settingsData, onRefresh }) {
  const confirm = useConfirm();

  async function updateSetting(setting) {
    const confirmed = await confirm({
      title: 'Update setting?',
      message: `Change the value for ${setting.setting_key}?`,
      confirmLabel: 'Continue',
    });
    if (!confirmed) return;

    const value = window.prompt(`Update ${setting.setting_key}`, setting.setting_value);
    if (!value) return;
    await api(`/settings/${setting.setting_key}`, {
      method: 'PATCH',
      body: JSON.stringify({ setting_value: value, description: setting.description }),
    });
    await onRefresh();
  }

  async function toggleRule(rule) {
    const nextActive = !rule.is_active;
    const confirmed = await confirm({
      title: nextActive ? 'Enable rule?' : 'Disable rule?',
      message: `${nextActive ? 'Enable' : 'Disable'} priority rule "${rule.name}"?`,
      confirmLabel: nextActive ? 'Enable' : 'Disable',
      tone: nextActive ? 'primary' : 'danger',
    });
    if (!confirmed) return;

    await api(`/settings/priority-rules/${rule.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: nextActive }),
    });
    await onRefresh();
  }

  return (
    <PageStack stagger={0.12}>
      <PageBlock>
        <Card title="System Settings" icon={Settings}>
          <SimpleTable rows={settingsData.settings || []} columns={['setting_key', 'setting_value', 'description']} renderActions={(setting) => <button className="text-cyan-700" type="button" onClick={() => updateSetting(setting)}>Edit</button>} />
        </Card>
      </PageBlock>
      <PageBlock>
        <Card title="Priority Rules" icon={Settings}>
          <SimpleTable rows={settingsData.rules || []} columns={['category', 'condition_key', 'name', 'score_value', 'is_active']} renderActions={(rule) => <button className="text-cyan-700" type="button" onClick={() => toggleRule(rule)}>{rule.is_active ? 'Disable' : 'Enable'}</button>} />
        </Card>
      </PageBlock>
    </PageStack>
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

function SmsLogsPanel({ rows }) {
  const logs = rows || [];
  return (
    <Card title="SMS Logs" icon={ClipboardList}>
      <p className="mb-4 text-sm text-slate-500">{logs.length} message{logs.length === 1 ? '' : 's'}</p>
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

function LogsPanel({ title, rows, columns }) {
  return (
    <Card title={title} icon={ClipboardList}>
      <SimpleTable rows={rows} columns={columns} />
    </Card>
  );
}
