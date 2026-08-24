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

const MotionDiv = motion.div;

export default function Login({ onLogin, onBack }) {
  const [email, setEmail] = useState('admin@carelink.local');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const session = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      storeSession(session);
      onLogin(session);
    } catch (err) {
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
        <form onSubmit={submit} className="relative rounded-3xl bg-white p-8 shadow-xl">
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
              <div className="space-y-4">
                <Field label="Email">
                  <TextInput value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
                </Field>
                <Field label="Password">
                  <TextInput value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
                </Field>
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
                  {loading ? 'Signing in...' : 'Sign in'}
                </PrimaryButton>
              </MotionDiv>
            </MotionHeroItem>

            <MotionHeroItem variant={popUp}>
              <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                Demo accounts: admin@carelink.local, barangay@carelink.local, city@carelink.local. Password: password123.
              </div>
            </MotionHeroItem>
          </MotionHero>
        </form>
      </MotionDiv>
    </main>
  );
}
