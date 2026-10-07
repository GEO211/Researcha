import { useEffect, useRef, useState } from 'react';
import { Camera, Eye, EyeOff, KeyRound, UserRound } from 'lucide-react';
import { api, storeSession } from '../api';
import {
  Field,
  InlineFlash,
  PageBlock,
  PageStack,
  PhPhoneInput,
  PrimaryButton,
  TextInput,
  useConfirm,
  Card,
} from '../components/ui';
import { formatDate, formatDateTime, roleLabel } from '../components/helpers';
import { ageFromBirthDate, normalizePhMobile } from '../lib/patientValidation';
import { EMAIL_PROVIDER_MESSAGE, isRecognizedEmail } from '@shared/emailProviders';

function issueMessage(error, field) {
  return error?.issues?.find((issue) => issue.field === field)?.message || '';
}

function PasswordField({ label, value, onChange, autoComplete, error, hint }) {
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label} error={error} hint={hint}>
      <div className="relative">
        <TextInput
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          className="pr-10"
          required
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </Field>
  );
}

function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-slate-900">{value || '—'}</p>
    </div>
  );
}

function fileToAvatarDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('Choose a JPG, PNG, or WebP image.'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('Image must be 5 MB or smaller.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Could not read that image.'));
      image.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, size, size);
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function AccountPhoto({ name, avatar, onChange }) {
  const inputRef = useRef(null);
  const initial = String(name || 'C').trim().charAt(0).toUpperCase();

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      onChange(await fileToAvatarDataUrl(file), '');
    } catch (readError) {
      onChange(avatar, readError.message || 'Could not read that image.');
    }
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-slate-900 text-xl font-semibold text-white ring-4 ring-slate-100"
        aria-label="Upload profile photo"
      >
        {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initial}
        <span className="absolute inset-0 grid place-items-center bg-slate-950/45 text-white opacity-0 transition group-hover:opacity-100">
          <Camera className="h-5 w-5" />
        </span>
      </button>
      <input id="account-photo-input" ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={chooseFile} />
    </div>
  );
}

function PatientProfile({ user }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api('/patient/profile')
      .then((data) => {
        if (active) setProfile(data.profile);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load your profile.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const age = profile?.birth_date ? ageFromBirthDate(profile.birth_date) : null;

  return (
    <PageStack>
      <PageBlock>
        <Card title="Profile" icon={UserRound}>
          {loading ? <p className="text-sm text-slate-500">Loading your profile…</p> : null}
          {error ? <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
          {profile ? (
            <>
              <h3 className="text-lg font-semibold text-slate-950">{profile.full_name || user.name}</h3>
              <p className="text-sm text-slate-500">Patient ID {profile.id}</p>
              {user?.tracking_code ? <p className="text-sm text-slate-500">Tracking code {user.tracking_code}</p> : null}
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {profile.contact_number ? (
                  <Fact label="Contact" value={profile.contact_number} />
                ) : null}
                {profile.email ? <Fact label="Email" value={profile.email} /> : null}
                {profile.birth_date ? (
                  <Fact label="Birth date" value={`${formatDate(profile.birth_date)}${age != null ? ` · ${age} yrs` : ''}`} />
                ) : null}
                {profile.sex ? <Fact label="Sex" value={profile.sex} /> : null}
                {profile.health_center_name ? <Fact label="Health center" value={profile.health_center_name} /> : null}
                {profile.address || profile.city ? (
                  <Fact
                    label="Address"
                    value={[profile.address, profile.address2, [profile.city, profile.province, profile.postal_code].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                  />
                ) : null}
              </dl>
              <p className="mt-4 text-xs text-slate-500">
                Your patient account is linked to your tracking code. Ask your barangay health center to update your record.
              </p>
            </>
          ) : null}
        </Card>
      </PageBlock>
    </PageStack>
  );
}

function StaffProfile({ session, onSessionUpdate }) {
  const confirm = useConfirm();
  const [account, setAccount] = useState(session.user);
  const [profile, setProfile] = useState({
    name: session.user.name || '',
    email: session.user.email || '',
    contact_number: session.user.contact_number || '',
    avatar: session.user.avatar || '',
  });
  const [password, setPassword] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [profileMessage, setProfileMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const profileDirty = useRef(false);
  const loadGeneration = useRef(0);

  function updateProfile(patch) {
    profileDirty.current = true;
    setProfile((current) => ({ ...current, ...patch }));
  }

  useEffect(() => {
    let active = true;
    const generation = loadGeneration.current;
    api('/auth/me')
      .then((data) => {
        if (!active || generation !== loadGeneration.current || !data?.user) return;
        setAccount(data.user);
        if (!profileDirty.current) {
          setProfile({
            name: data.user.name || '',
            email: data.user.email || '',
            contact_number: data.user.contact_number || '',
            avatar: data.user.avatar || '',
          });
        }
        onSessionUpdate({ ...session, user: { ...session.user, ...data.user } });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    setProfileMessage('');
    setProfileError('');
    setFieldErrors({});

    const contact = String(profile.contact_number || '').trim();
    const nextErrors = {};
    if (contact && !normalizePhMobile(contact)) {
      nextErrors.contact_number = 'Enter a PH mobile number (+639XXXXXXXXX).';
    }
    const emailChanged = profile.email.trim().toLowerCase() !== String(session.user.email || '').trim().toLowerCase();
    if (emailChanged && !isRecognizedEmail(profile.email)) {
      nextErrors.email = EMAIL_PROVIDER_MESSAGE;
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }

    const confirmed = await confirm({
      title: 'Save account?',
      message: 'Update your name, email, and contact number?',
      confirmLabel: 'Save account',
    });
    if (!confirmed) return;

    setSavingProfile(true);
    loadGeneration.current += 1;
    try {
      const nextSession = await api('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: profile.name.trim(),
          email: profile.email.trim(),
          contact_number: contact ? normalizePhMobile(contact) : '',
          avatar: profile.avatar || '',
        }),
      });
      storeSession(nextSession);
      onSessionUpdate(nextSession);
      setAccount(nextSession.user);
      setProfile({
        name: nextSession.user.name || '',
        email: nextSession.user.email || '',
        contact_number: nextSession.user.contact_number || '',
        avatar: nextSession.user.avatar || '',
      });
      setProfileMessage('Account updated.');
    } catch (error) {
      setProfileError(error.message || 'Could not update your account.');
      setFieldErrors({
        name: issueMessage(error, 'name'),
        email: issueMessage(error, 'email'),
        contact_number: issueMessage(error, 'contact_number'),
        avatar: issueMessage(error, 'avatar'),
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPasswordMessage('');
    setPasswordError('');
    setFieldErrors({});

    if (password.new_password.length < 8) {
      setFieldErrors({ new_password: 'New password must be at least 8 characters.' });
      return;
    }
    if (password.new_password !== password.confirm_password) {
      setFieldErrors({ confirm_password: 'New password and confirmation do not match.' });
      return;
    }

    const confirmed = await confirm({
      title: 'Update password?',
      message: 'Change your account password?',
      confirmLabel: 'Update password',
    });
    if (!confirmed) return;

    setSavingPassword(true);
    try {
      await api('/auth/password', { method: 'PATCH', body: JSON.stringify(password) });
      setPassword({ current_password: '', new_password: '', confirm_password: '' });
      setPasswordMessage('Password updated.');
    } catch (error) {
      setPasswordError(error.message || 'Could not update your password.');
      setFieldErrors({
        current_password: issueMessage(error, 'current_password'),
        new_password: issueMessage(error, 'new_password'),
        confirm_password: issueMessage(error, 'confirm_password'),
      });
    } finally {
      setSavingPassword(false);
    }
  }

  const statusLabel = account.status === 'disabled' ? 'Disabled' : 'Active';

  return (
    <PageStack>
      <PageBlock>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <AccountPhoto
              name={profile.name || account.name}
              avatar={profile.avatar}
              onChange={(avatar, avatarError) => {
                updateProfile({ avatar });
                setFieldErrors((current) => ({ ...current, avatar: avatarError }));
              }}
            />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold tracking-tight text-slate-950">{account.name}</h2>
              <p className="truncate text-sm text-slate-500">{account.email}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => document.getElementById('account-photo-input')?.click()}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Upload photo
                </button>
                {profile.avatar ? (
                  <button
                    type="button"
                    onClick={() => updateProfile({ avatar: '' })}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    Remove
                  </button>
                ) : null}
                <p className="text-xs text-slate-500">Saved as a base64 JPEG when you save the account.</p>
              </div>
              {fieldErrors.avatar ? <p className="mt-2 text-xs font-medium text-red-600">{fieldErrors.avatar}</p> : null}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
            <Fact label="Role" value={roleLabel(account.role)} />
            <Fact label="Health center" value={account.health_center_name || 'System-wide'} />
            <Fact label="Status" value={statusLabel} />
            <Fact label="Last sign-in" value={formatDateTime(account.last_login_at)} />
          </div>
        </section>
      </PageBlock>

      <PageBlock>
        <div className="grid gap-5 lg:grid-cols-2">
          <form onSubmit={saveProfile} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-700">
                <UserRound className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Account details</h3>
                <p className="text-xs text-slate-500">Name, email, and the number used to reach this account.</p>
              </div>
            </div>
            <div className="space-y-4">
              <Field label="Name" error={fieldErrors.name}>
                <TextInput value={profile.name} onChange={(event) => updateProfile({ name: event.target.value })} required />
              </Field>
              <Field label="Email" error={fieldErrors.email}>
                <TextInput type="email" autoComplete="email" value={profile.email} onChange={(event) => updateProfile({ email: event.target.value })} placeholder="name@gmail.com" required />
              </Field>
              <Field label="Contact" error={fieldErrors.contact_number} hint="Philippine mobile number.">
                <PhPhoneInput
                  value={profile.contact_number}
                  onChange={(event) => updateProfile({ contact_number: event.target.value })}
                  aria-invalid={Boolean(fieldErrors.contact_number)}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <PrimaryButton disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save account'}</PrimaryButton>
                <InlineFlash message={profileMessage} type="success" />
                <InlineFlash message={profileError} type="error" />
              </div>
            </div>
          </form>

          <form onSubmit={savePassword} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-700">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Password</h3>
                <p className="text-xs text-slate-500">Use at least 8 characters. Confirm the new password before saving.</p>
              </div>
            </div>
            <div className="space-y-4">
              <PasswordField
                label="Current password"
                autoComplete="current-password"
                value={password.current_password}
                error={fieldErrors.current_password}
                onChange={(event) => setPassword({ ...password, current_password: event.target.value })}
              />
              <PasswordField
                label="New password"
                autoComplete="new-password"
                value={password.new_password}
                error={fieldErrors.new_password}
                hint="At least 8 characters."
                onChange={(event) => setPassword({ ...password, new_password: event.target.value })}
              />
              <PasswordField
                label="Confirm password"
                autoComplete="new-password"
                value={password.confirm_password}
                error={fieldErrors.confirm_password}
                onChange={(event) => setPassword({ ...password, confirm_password: event.target.value })}
              />
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <PrimaryButton disabled={savingPassword}>{savingPassword ? 'Updating…' : 'Update password'}</PrimaryButton>
                <InlineFlash message={passwordMessage} type="success" />
                <InlineFlash message={passwordError} type="error" />
              </div>
            </div>
          </form>
        </div>
      </PageBlock>
    </PageStack>
  );
}

export default function Profile({ session, onSessionUpdate }) {
  if (session?.user?.role === 'patient') {
    return <PatientProfile user={session.user} />;
  }
  return <StaffProfile session={session} onSessionUpdate={onSessionUpdate} />;
}
