import { useState } from 'react';
import { ClipboardList, Mail, Settings, Users } from 'lucide-react';
import { api } from '../api';
import {
  AnimatedGrid,
  AnimatedGridItem,
  Card,
  Field,
  PageBlock,
  PageStack,
  PrimaryButton,
  SelectInput,
  SimpleTable,
  TabPanel,
  TextInput,
  useConfirm,
} from '../components/ui';
import { classNames, roleLabel } from '../components/helpers';

export default function Admin({ users, healthCenters, settingsData, smsLogs, emailLogs, auditLogs, onRefresh }) {
  const [active, setActive] = useState('users');
  const categories = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'centers', label: 'Health Centers', icon: Settings },
    { id: 'settings', label: 'System Settings', icon: Settings },
    { id: 'sms', label: 'SMS Logs', icon: ClipboardList },
    { id: 'email', label: 'Email Logs', icon: Mail },
    { id: 'audit', label: 'Audit Logs', icon: ClipboardList },
  ];

  const auditRows = (auditLogs || []).map((log) => ({
    ...log,
    actor_name: log.user_name || 'System',
    entity_type: log.auditable_type || '—',
    entity_id: log.auditable_id || '—',
  }));

  return (
    <PageStack>
      <PageBlock>
        <section>
          <AnimatedGrid className="grid gap-3 md:grid-cols-6">
            {categories.map((category) => {
              const Icon = category.icon;
              const isActive = active === category.id;
              return (
                <AnimatedGridItem key={category.id}>
                  <button
                    type="button"
                    onClick={() => setActive(category.id)}
                    className={classNames(
                      'w-full rounded-2xl border p-4 text-left transition',
                      isActive ? 'border-cyan-200 bg-cyan-50 text-cyan-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <Icon className="mb-2 h-5 w-5" />
                    <span className="font-semibold">{category.label}</span>
                  </button>
                </AnimatedGridItem>
              );
            })}
          </AnimatedGrid>
        </section>
      </PageBlock>

      <PageBlock>
        <TabPanel panelKey={active}>
          {active === 'users' ? <UserManagement users={users} healthCenters={healthCenters} onRefresh={onRefresh} /> : null}
          {active === 'centers' ? <HealthCenterManagement healthCenters={healthCenters} onRefresh={onRefresh} /> : null}
          {active === 'settings' ? <SystemSettings settingsData={settingsData} onRefresh={onRefresh} /> : null}
          {active === 'sms' ? <LogsPanel title="SMS Logs" rows={smsLogs} columns={['recipient_number', 'message', 'status', 'trigger_type', 'created_at']} /> : null}
          {active === 'email' ? <LogsPanel title="Email Logs" rows={emailLogs} columns={['recipient_email', 'subject', 'status', 'trigger_type', 'created_at']} /> : null}
          {active === 'audit' ? <LogsPanel title="Audit Logs" rows={auditRows} columns={['actor_name', 'action', 'entity_type', 'entity_id', 'created_at']} /> : null}
        </TabPanel>
      </PageBlock>
    </PageStack>
  );
}

function UserManagement({ users, healthCenters, onRefresh }) {
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'barangay_staff', health_center_id: '', status: 'active' });
  const [editing, setEditing] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const confirmed = await confirm({
      title: 'Create user?',
      message: `Create account for ${form.email || 'this user'}?`,
      confirmLabel: 'Create user',
    });
    if (!confirmed) return;

    await api('/users', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        health_center_id: form.health_center_id ? Number(form.health_center_id) : null,
      }),
    });
    setForm({ name: '', email: '', password: '', role: 'barangay_staff', health_center_id: '', status: 'active' });
    await onRefresh();
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
              <option value="city_staff">City Staff</option>
              <option value="super_admin">Super Admin</option>
            </SelectInput>
          </Field>
          <Field label="Health center">
            <SelectInput value={editing.health_center_id || ''} onChange={(e) => setEditing({ ...editing, health_center_id: e.target.value })}>
              <option value="">No assigned center</option>
              {healthCenters.map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}
            </SelectInput>
          </Field>
          <div className="flex items-end gap-2">
            <PrimaryButton>Save changes</PrimaryButton>
            <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      ) : null}

      <form onSubmit={submit} className="mb-5 grid gap-3 md:grid-cols-3">
        <Field label="Name"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
        <Field label="Email"><TextInput type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
        <Field label="Password"><TextInput type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></Field>
        <Field label="Role">
          <SelectInput value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option value="barangay_staff">Barangay Staff</option>
            <option value="city_staff">City Staff</option>
            <option value="super_admin">Super Admin</option>
          </SelectInput>
        </Field>
        <Field label="Health center">
          <SelectInput value={form.health_center_id} onChange={(event) => setForm({ ...form, health_center_id: event.target.value })}>
            <option value="">No assigned center</option>
            {healthCenters.map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}
          </SelectInput>
        </Field>
        <div className="flex items-end"><PrimaryButton>Create user</PrimaryButton></div>
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

function HealthCenterManagement({ healthCenters, onRefresh }) {
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: '', type: 'barangay', address: '', contact_number: '', status: 'active' });

  async function submit(event) {
    event.preventDefault();
    const confirmed = await confirm({
      title: 'Add health center?',
      message: `Add ${form.name || 'this health center'} to the system?`,
      confirmLabel: 'Add center',
    });
    if (!confirmed) return;

    await api('/health-centers', { method: 'POST', body: JSON.stringify(form) });
    setForm({ name: '', type: 'barangay', address: '', contact_number: '', status: 'active' });
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

  return (
    <Card title="Health Centers" icon={Settings}>
      <form onSubmit={submit} className="mb-5 grid gap-3 md:grid-cols-3">
        <Field label="Name"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
        <Field label="Type">
          <SelectInput value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            <option value="barangay">Barangay</option>
            <option value="city">City</option>
          </SelectInput>
        </Field>
        <Field label="Contact"><TextInput value={form.contact_number} onChange={(event) => setForm({ ...form, contact_number: event.target.value })} /></Field>
        <Field label="Address"><TextInput value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} required /></Field>
        <div className="flex items-end"><PrimaryButton>Add center</PrimaryButton></div>
      </form>
      <SimpleTable rows={healthCenters} columns={['name', 'type', 'address', 'contact_number', 'status']} renderActions={(center) => <button className="text-cyan-700" type="button" onClick={() => toggleStatus(center)}>{center.status === 'active' ? 'Deactivate' : 'Activate'}</button>} />
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

function LogsPanel({ title, rows, columns }) {
  return (
    <Card title={title} icon={ClipboardList}>
      <SimpleTable rows={rows} columns={columns} />
    </Card>
  );
}
