import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarClock,
  ChevronDown,
  ClipboardCopy,
  HeartPulse,
  MapPin,
  Search,
  Shield,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '../api';
import { classNames, formatDate, formatDateTime, prettyEnum, priorityLabel } from '../components/helpers';
import {
  AnimatedPanel,
  Card,
  ExpandPanel,
  FlashMessage,
  LoadingOverlay,
  PageBlock,
  PageStack,
  PrimaryButton,
  StatusBadge,
  TextInput,
  easeOut,
} from '../components/ui';
import {
  PATIENT_CLASSIFICATION_FIELDS,
  classificationTones,
  patientClassificationTags,
} from '../data/patientClassifications';
import { normalizePhMobile } from '../lib/patientValidation';

const MotionDiv = motion.div;
const MotionButton = motion.button;

function patientFullName(result) {
  const assembled = [result.first_name, result.middle_name, result.last_name].filter(Boolean).join(' ').trim();
  return assembled || result.patient_name || '—';
}

function manilaDateParts(value) {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10)) && !raw.includes('T')) {
    const [year, month, day] = raw.slice(0, 10).split('-').map(Number);
    return { year, month, day };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
  const [year, month, day] = formatted.split('-').map(Number);
  return { year, month, day };
}

function patientAge(birthDate) {
  const birth = manilaDateParts(birthDate);
  if (!birth) return null;
  const today = manilaDateParts(new Date());
  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) age -= 1;
  return age >= 0 ? age : null;
}

function formatPhone(value) {
  return normalizePhMobile(value) || value || '—';
}

function addressLines(result) {
  return [
    result.address,
    result.address2,
    [result.city, result.province, result.postal_code].filter(Boolean).join(', '),
  ].filter(Boolean);
}

function Fact({ label, value, span = false }) {
  return (
    <div className={span ? 'sm:col-span-2' : undefined}>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{value || '—'}</dd>
    </div>
  );
}

function ClassificationBadges({ patient }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {patientClassificationTags(patient).map((tag) => (
        <span
          key={tag}
          className={classNames(
            'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
            classificationTones[tag],
          )}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function trackingStatusBannerClass(result) {
  if (result.is_cancelled) return 'border-slate-200 bg-slate-100 text-slate-800';
  if (result.is_expired) return 'border-amber-200 bg-amber-50 text-amber-900';
  if (result.display_status === 'rejected' || result.status === 'rejected') {
    return 'border-red-200 bg-red-50 text-red-800';
  }
  return 'border-cyan-100 bg-cyan-50 text-cyan-900';
}

function referralTrackingCode(referral) {
  return referral.tracking_code || referral.referral_code || '';
}

export default function Tracking({ initialCode = '', referrals = [], user = null }) {
  const isPatient = user?.role === 'patient';
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const recentReferrals = useMemo(() => (
    [...referrals]
      .filter((row) => referralTrackingCode(row))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 8)
  ), [referrals]);

  const lookup = useCallback(async (codeToLookup = code) => {
    const trimmed = String(codeToLookup || '').trim();
    if (!trimmed) {
      setError('Enter a tracking code.');
      return;
    }

    setCode(trimmed);
    setError('');
    setResult(null);
    setLookingUp(true);

    try {
      const data = await api(`/referrals/track/${encodeURIComponent(trimmed)}`);
      setResult(data);
      setDetailsOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLookingUp(false);
    }
  }, [code]);

  useEffect(() => {
    const next = String(initialCode || '').trim();
    if (!next) return;
    setCode(next);
    lookup(next);
  }, [initialCode]);

  async function copyCode(value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy the tracking code.');
    }
  }

  const age = result ? patientAge(result.birth_date) : null;
  const showPrivate = Boolean(result?.is_staff_view);
  const reasons = Array.isArray(result?.priority_reasons) ? result.priority_reasons : [];

  return (
    <PageStack>
      <PageBlock>
        <LoadingOverlay open={lookingUp} label="Looking up referral" />
        <Card title="Track Referral" icon={HeartPulse}>
          <p className="mb-4 text-sm text-slate-500">
            Enter a tracking code or tap a recent referral to open the full patient, referral, and queue record.
          </p>
          <AnimatedPanel>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                lookup();
              }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <TextInput
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Enter tracking code"
                  required
                  className="pl-10"
                />
              </div>
              <MotionDiv whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <PrimaryButton disabled={lookingUp}>{lookingUp ? 'Looking up...' : 'Track'}</PrimaryButton>
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
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setDetailsOpen((open) => !open)}
                  className="flex w-full items-start justify-between gap-3 bg-gradient-to-r from-cyan-50 via-white to-teal-50 px-4 py-4 text-left transition hover:from-cyan-100/80 hover:to-teal-50"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-mono text-base font-bold tracking-tight text-slate-950">
                        {result.tracking_code || result.referral_code}
                      </h3>
                      <StatusBadge value={result.display_status || result.status} />
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{patientFullName(result)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {result.status_subtitle || result.receiving_center_name || 'Referral found'}
                    </p>
                  </div>
                  <ChevronDown className={cn('mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform', detailsOpen && 'rotate-180')} />
                </button>

                <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => copyCode(result.tracking_code || result.referral_code)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-cyan-200 hover:text-cyan-800"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    {copied ? 'Copied' : 'Copy code'}
                  </button>
                  <a
                    href={`/live-queue?code=${encodeURIComponent(result.tracking_code || result.referral_code || '')}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100"
                  >
                    Open live queue
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-4 py-3 sm:grid-cols-4">
                  {[
                    ['Queue', result.queue_number || (result.is_expired ? 'Expired' : 'Not assigned')],
                    ['Position', result.queue_position ? `#${result.queue_position}` : 'Not in line'],
                    ['Priority', priorityLabel(result.priority_band || result.priority_level)],
                    ['Appointment', result.appointment_at || result.appointment_time ? formatDateTime(result.appointment_at || result.appointment_time) : 'Not scheduled'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>

                <ExpandPanel open={detailsOpen}>
                  <div className="space-y-4 p-4">
                    {result.status_message ? (
                      <p className={cn('rounded-xl border px-3 py-2 text-sm', trackingStatusBannerClass(result))}>
                        {result.status_message}
                      </p>
                    ) : null}

                    <section className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <div className="mb-3 flex items-center gap-2 text-slate-900">
                        <UserRound className="h-4 w-4 text-cyan-700" />
                        <h4 className="text-sm font-semibold">Patient</h4>
                      </div>
                      <ClassificationBadges patient={result} />
                      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Fact label="Full name" value={patientFullName(result)} />
                        <Fact
                          label="Sex / age"
                          value={[
                            result.sex ? prettyEnum(result.sex) : null,
                            age != null ? `${age} years` : null,
                            result.birth_date ? `Born ${formatDate(result.birth_date)}` : null,
                          ].filter(Boolean).join(' · ') || (showPrivate ? '—' : 'Available to staff')}
                        />
                        {showPrivate ? (
                          <>
                            <Fact label="Contact" value={formatPhone(result.contact_number)} />
                            <Fact label="Email" value={result.email} />
                            <Fact label="Registered center" value={result.patient_health_center_name} />
                            <Fact label="Record status" value={prettyEnum(result.patient_record_status || 'active')} />
                            <Fact
                              label="Home address"
                              value={addressLines(result).join(' · ') || result.home_barangay}
                              span
                            />
                            <Fact label="Emergency contact" value={result.emergency_contact_name} />
                            <Fact label="Emergency number" value={formatPhone(result.emergency_contact_number)} />
                          </>
                        ) : (
                          <Fact label="Classifications" value={(result.classifications || []).join(', ') || 'Standard'} span />
                        )}
                      </dl>
                      {showPrivate && result.medical_notes ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Medical notes</p>
                          <p className="mt-1 text-sm text-slate-800">{result.medical_notes}</p>
                        </div>
                      ) : null}
                    </section>

                    <section className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <div className="mb-3 flex items-center gap-2 text-slate-900">
                        <MapPin className="h-4 w-4 text-cyan-700" />
                        <h4 className="text-sm font-semibold">Referral</h4>
                      </div>
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <Fact label="Referring center" value={result.referring_center_name} />
                        <Fact label="Receiving / checkup" value={result.checkup_location || result.receiving_center_name} />
                        <Fact label="Checkup barangay" value={result.checkup_barangay} />
                        <Fact label="Severity" value={prettyEnum(result.severity_level)} />
                        <Fact label="Clinical urgency" value={prettyEnum(result.clinical_urgency)} />
                        <Fact label="Referral type" value={prettyEnum(result.referral_type)} />
                        <Fact label="Submitted" value={formatDateTime(result.created_at)} />
                        <Fact label="Reviewed" value={result.reviewed_at ? formatDateTime(result.reviewed_at) : 'Not reviewed'} />
                        <Fact label="Reason" value={result.referral_reason} span />
                        {result.rejection_reason ? <Fact label="Rejection reason" value={result.rejection_reason} span /> : null}
                      </dl>
                    </section>

                    <section className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <div className="mb-3 flex items-center gap-2 text-slate-900">
                        <Shield className="h-4 w-4 text-cyan-700" />
                        <h4 className="text-sm font-semibold">Queue and priority</h4>
                      </div>
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <Fact label="Queue number" value={result.queue_number || (result.is_expired ? 'Queue expired' : 'Not assigned')} />
                        <Fact
                          label="Position"
                          value={result.queue_position
                            ? `#${result.queue_position} in line${result.people_ahead != null ? ` · ${result.people_ahead} ahead` : ''}`
                            : 'Not in active queue'}
                        />
                        <Fact label="Queue status" value={prettyEnum(result.queue_status)} />
                        <Fact label="Queue date" value={result.queue_date ? formatDate(result.queue_date) : '—'} />
                        <Fact label="Priority" value={priorityLabel(result.priority_band || result.priority_level)} />
                        <Fact label="Priority score" value={result.priority_score != null ? String(result.priority_score) : '—'} />
                        <Fact label="Appointment" value={result.appointment_at || result.appointment_time ? formatDateTime(result.appointment_at || result.appointment_time) : 'Not scheduled'} />
                        <Fact label="Completed" value={result.completed_at ? formatDateTime(result.completed_at) : '—'} />
                      </dl>
                      {reasons.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {reasons.map((reason) => (
                            <span key={reason} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                              {reason}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  </div>
                </ExpandPanel>
              </MotionDiv>
            ) : null}
          </AnimatePresence>
        </Card>
      </PageBlock>

      {!isPatient && recentReferrals.length ? (
        <PageBlock>
          <Card title="Recent referrals" icon={CalendarClock}>
            <p className="mb-4 text-sm text-slate-500">
              Click a referral to load every patient and queue detail in Track Referral.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {recentReferrals.map((referral, index) => {
                const nextCode = referralTrackingCode(referral);
                const active = String(result?.tracking_code || '').toUpperCase() === String(nextCode).toUpperCase();
                return (
                  <MotionButton
                    key={referral.id || nextCode}
                    type="button"
                    onClick={() => lookup(nextCode)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 * index, duration: 0.35, ease: easeOut }}
                    whileHover={{ y: -2 }}
                    className={cn(
                      'rounded-2xl border px-4 py-3 text-left transition',
                      active
                        ? 'border-cyan-300 bg-cyan-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/50',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-xs font-semibold text-slate-800">{nextCode}</p>
                      <StatusBadge value={referral.status} />
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {referral.patient_name || [referral.first_name, referral.last_name].filter(Boolean).join(' ') || 'Patient'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {referral.receiving_center_name || referral.checkup_location || 'Checkup location pending'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {PATIENT_CLASSIFICATION_FIELDS.filter((field) => referral[field.key]).slice(0, 3).map((field) => (
                        <span key={field.key} className={classNames('rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset', field.tone)}>
                          {field.shortLabel}
                        </span>
                      ))}
                    </div>
                  </MotionButton>
                );
              })}
            </div>
          </Card>
        </PageBlock>
      ) : null}
    </PageStack>
  );
}
