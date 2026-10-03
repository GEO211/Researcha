import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HeartPulse } from 'lucide-react';
import { api, storeSession } from '../api';
import {
  Field,
  LoadingOverlay,
  MotionHero,
  MotionHeroItem,
  PrimaryButton,
  TextInput,
  easeOut,
  popUp,
} from '../components/ui';
import { classNames } from '../components/helpers';

const MotionDiv = motion.div;

export default function Login({ onLogin, onBack }) {
  const [portal, setPortal] = useState('staff');
  const [email, setEmail] = useState('admin@carelink.local');
  const [password, setPassword] = useState('password123');
  const [trackingCode, setTrackingCode] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    const localErrors = {};

    if (portal === 'patient') {
      if (!String(trackingCode || '').trim()) localErrors.tracking_code = 'Tracking code is required.';
      if (!String(lastName || '').trim()) localErrors.last_name = 'Last name is required.';
      if (Object.keys(localErrors).length) {
        setFieldErrors(localErrors);
        setError(Object.values(localErrors)[0]);
        return;
      }
      setFieldErrors({});
      setLoading(true);
      try {
        const session = await api('/auth/patient', {
          method: 'POST',
          body: JSON.stringify({ tracking_code: trackingCode.trim(), last_name: lastName.trim() }),
        });
        storeSession(session);
        onLogin(session);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!String(email || '').trim()) localErrors.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) localErrors.email = 'Enter a valid email address.';
    if (!String(password || '').trim()) localErrors.password = 'Password is required.';
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      setError(Object.values(localErrors)[0]);
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      const session = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      storeSession(session);
      onLogin(session);
    } catch (err) {
      if (err.issues?.length) {
        const next = {};
        for (const issue of err.issues) {
          if (issue.field && !next[issue.field]) next[issue.field] = issue.message;
        }
        setFieldErrors(next);
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-cyan-50 via-white to-blue-50 p-4">
      <LoadingOverlay open={loading} label="Signing in" />
      <MotionDiv
        initial={{ opacity: 0, scale: 0.88, y: 28 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.65, ease: easeOut }}
        className="w-full max-w-md"
      >
        <form onSubmit={submit} className="relative rounded-3xl bg-white p-8 shadow-xl" noValidate>
          <MotionHero>
            {onBack ? (
              <MotionHeroItem variant={popUp}>
                <button
                  type="button"
                  onClick={onBack}
                  className="mb-4 text-sm font-medium text-cyan-700 transition hover:text-cyan-900"
                >
                  ← Back to home
                </button>
              </MotionHeroItem>
            ) : null}

            <MotionHeroItem variant={popUp}>
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-cyan-700 p-3 text-white">
                  <HeartPulse className="h-7 w-7" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">CareLink</h1>
                  <p className="text-sm text-slate-500">Smart Health Referral System</p>
                </div>
              </div>
            </MotionHeroItem>

            <MotionHeroItem variant={popUp}>
              <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => { setPortal('staff'); setError(''); setFieldErrors({}); }}
                  className={classNames(
                    'rounded-xl px-3 py-2 text-sm font-semibold transition',
                    portal === 'staff' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                  )}
                >
                  Staff
                </button>
                <button
                  type="button"
                  onClick={() => { setPortal('patient'); setError(''); setFieldErrors({}); }}
                  className={classNames(
                    'rounded-xl px-3 py-2 text-sm font-semibold transition',
                    portal === 'patient' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                  )}
                >
                  Patient
                </button>
              </div>
            </MotionHeroItem>

            <MotionHeroItem variant={popUp}>
              <div className="space-y-4">
                {portal === 'staff' ? (
                  <>
                    <Field label="Email" error={fieldErrors.email}>
                      <TextInput value={email} onChange={(event) => setEmail(event.target.value)} type="email" aria-invalid={Boolean(fieldErrors.email)} required />
                    </Field>
                    <Field label="Password" error={fieldErrors.password}>
                      <TextInput value={password} onChange={(event) => setPassword(event.target.value)} type="password" aria-invalid={Boolean(fieldErrors.password)} required />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Tracking code" error={fieldErrors.tracking_code}>
                      <TextInput value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} placeholder="Referral / tracking code" aria-invalid={Boolean(fieldErrors.tracking_code)} required />
                    </Field>
                    <Field label="Last name" error={fieldErrors.last_name}>
                      <TextInput value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Must match the patient record" aria-invalid={Boolean(fieldErrors.last_name)} required />
                    </Field>
                  </>
                )}
              </div>
            </MotionHeroItem>

            <AnimatePresence mode="wait">
              {error ? (
                <MotionDiv
                  key="login-error"
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                  className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
                >
                  {error}
                </MotionDiv>
              ) : null}
            </AnimatePresence>

            <MotionHeroItem variant={popUp}>
              <MotionDiv whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <PrimaryButton disabled={loading} className="mt-6 w-full">
                  {loading ? 'Signing in...' : portal === 'patient' ? 'View my care status' : 'Sign in'}
                </PrimaryButton>
              </MotionDiv>
            </MotionHeroItem>

            <MotionHeroItem variant={popUp}>
              <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                {/* {portal === 'patient'
                  ? 'Patients can only view their own referral and queue status. Staff accounts keep full operational access based on role.'
                  : 'Demo accounts: admin@carelink.local (Super Admin), city@carelink.local (City Health Personnel), barangay@carelink.local. Password: password123.'} */}
              </div>
            </MotionHeroItem>
          </MotionHero>
        </form>
      </MotionDiv>
    </main>
  );
}
