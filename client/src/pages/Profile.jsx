import { useState } from 'react';
import { Users } from 'lucide-react';
import { api, storeSession } from '../api';
import {
  AnimatedPanel,
  Card,
  Field,
  InlineFlash,
  PageBlock,
  PageStack,
  PrimaryButton,
  TextInput,
  useConfirm,
} from '../components/ui';
import { roleLabel } from '../components/helpers';

export default function Profile({ session, onSessionUpdate }) {
  const confirm = useConfirm();
  const [profile, setProfile] = useState({ name: session.user.name, email: session.user.email });
  const [password, setPassword] = useState({ current_password: '', new_password: '' });
  const [message, setMessage] = useState('');

  async function saveProfile(event) {
    event.preventDefault();

    const confirmed = await confirm({
      title: 'Save profile?',
      message: 'Update your profile information?',
      confirmLabel: 'Save profile',
    });
    if (!confirmed) return;

    const nextSession = await api('/auth/me', { method: 'PATCH', body: JSON.stringify(profile) });
    storeSession(nextSession);
    onSessionUpdate(nextSession);
    setMessage('Profile updated.');
  }

  async function savePassword(event) {
    event.preventDefault();

    const confirmed = await confirm({
      title: 'Update password?',
      message: 'Change your account password?',
      confirmLabel: 'Update password',
    });
    if (!confirmed) return;

    await api('/auth/password', { method: 'PATCH', body: JSON.stringify(password) });
    setPassword({ current_password: '', new_password: '' });
    setMessage('Password updated.');
  }

  return (
    <PageStack className="grid gap-5 xl:grid-cols-2" stagger={0.12}>
      <PageBlock>
        <Card title="My Profile" icon={Users}>
          <AnimatedPanel className="mb-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p><strong>Role:</strong> {roleLabel(session.user.role)}</p>
            <p><strong>Health Center:</strong> {session.user.health_center_name || 'System-wide'}</p>
          </AnimatedPanel>
          <form onSubmit={saveProfile} className="space-y-3">
            <Field label="Name"><TextInput value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required /></Field>
            <Field label="Email"><TextInput type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required /></Field>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <PrimaryButton>Save profile</PrimaryButton>
              <InlineFlash message={message} type="success" />
            </div>
          </form>
        </Card>
      </PageBlock>
      <PageBlock>
        <Card title="Change Password" icon={Users}>
          <form onSubmit={savePassword} className="space-y-3">
            <Field label="Current password"><TextInput type="password" value={password.current_password} onChange={(event) => setPassword({ ...password, current_password: event.target.value })} required /></Field>
            <Field label="New password"><TextInput type="password" value={password.new_password} onChange={(event) => setPassword({ ...password, new_password: event.target.value })} required minLength={8} /></Field>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <PrimaryButton>Update password</PrimaryButton>
              <InlineFlash message={message} type="success" />
            </div>
          </form>
        </Card>
      </PageBlock>
    </PageStack>
  );
}
