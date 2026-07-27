import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HeartPulse } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '../api';
import {
  AnimatedPanel,
  Card,
  FlashMessage,
  PageBlock,
  PrimaryButton,
  StatusBadge,
  TextInput,
  easeOut,
} from '../components/ui';

const MotionDiv = motion.div;

export default function Tracking({ initialCode = '' }) {
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const lookup = useCallback(async (codeToLookup = code) => {
    setError('');
    setResult(null);
    try {
      const data = await api(`/public/track/${codeToLookup}`);
      setResult(data);
    } catch (err) {
      setError(err.message);
    }
  }, [code]);

  useEffect(() => {
    if (initialCode) {
      setTimeout(() => lookup(initialCode), 0);
    }
  }, [initialCode, lookup]);

  return (
    <PageBlock>
      <Card title="Track Referral" icon={HeartPulse}>
        <AnimatedPanel>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              lookup();
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <TextInput value={code} onChange={(event) => setCode(event.target.value)} placeholder="Enter tracking code" required />
            <MotionDiv whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <PrimaryButton>Track</PrimaryButton>
            </MotionDiv>
          </form>
        </AnimatedPanel>

        <div className="mt-4">
          <FlashMessage message={error} type="error" />
        </div>

        <AnimatePresence mode="wait">
          {result ? (
            <MotionDiv
              key={result.tracking_code}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="mt-5 rounded-2xl bg-slate-50 p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold">{result.tracking_code || result.referral_code}</h3>
                <StatusBadge value={result.display_status || result.status} />
              </div>
              {result.status_subtitle ? (
                <p className="mt-1 text-sm text-slate-500">{result.status_subtitle}</p>
              ) : null}
              {result.status_message ? (
                <p className={cn(
                  'mt-3 rounded-xl border px-3 py-2 text-sm',
                  result.is_cancelled && 'border-slate-200 bg-slate-100 text-slate-800',
                  result.is_expired && 'border-amber-200 bg-amber-50 text-amber-900',
                  (result.display_status === 'rejected' || result.status === 'rejected') && 'border-red-200 bg-red-50 text-red-800',
                )}>
                  {result.status_message}
                </p>
              ) : null}
              {[
                ['Patient', result.patient_name],
                ['Receiving Center', result.receiving_center_name],
                ['Appointment', result.appointment_time ? new Date(result.appointment_time).toLocaleString() : 'Not scheduled'],
                ['Queue Number', result.queue_number || (result.is_expired ? 'Queue expired' : 'Not assigned')],
              ].map(([label, value], index) => (
                <MotionDiv
                  key={label}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 * index, duration: 0.4, ease: easeOut }}
                  className="mt-2 text-sm text-slate-600"
                >
                  {label}: {value}
                </MotionDiv>
              ))}
            </MotionDiv>
          ) : null}
        </AnimatePresence>
      </Card>
    </PageBlock>
  );
}
