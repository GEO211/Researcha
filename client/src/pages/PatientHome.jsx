import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Circle,
  Clock3,
  HeartPulse,
  MapPin,
  Star,
  UserRound,
  Users,
} from 'lucide-react';
import { api } from '../api';
import { classNames, formatDate, formatDateTime, formatTime } from '../components/helpers';
import { SubmittedVisitRating, VisitRatingForm } from '../components/patient-visit-rating';
import { Card, PageBlock, PageStack, PrimaryButton } from '../components/ui';
import { ageFromBirthDate } from '../lib/patientValidation';

const REFRESH_MS = 8000;

function waitLabel(minutes) {
  if (minutes == null) return '—';
  if (minutes <= 0) return 'Now';
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `~${hours}h ${rest}m` : `~${hours}h`;
}

function VisitStatusChip({ label }) {
  return (
    <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white ring-1 ring-white/20">
      {label}
    </span>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950 sm:text-2xl">{value || '—'}</p>
    </div>
  );
}

function ProgressTrack({ steps = [] }) {
  return (
    <ol className="grid grid-cols-5 gap-2">
      {steps.map((step) => {
        const Icon = step.state === 'done' ? CheckCircle2 : Circle;
        return (
          <li key={step.id} className="min-w-0 text-center">
            <div className={classNames(
              'mx-auto grid h-9 w-9 place-items-center rounded-full',
              step.state === 'done' && 'bg-emerald-100 text-emerald-700',
              step.state === 'current' && 'bg-cyan-600 text-white',
              step.state === 'upcoming' && 'bg-slate-100 text-slate-400',
              step.state === 'skipped' && 'bg-slate-100 text-slate-300',
            )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <p className={classNames('mt-2 truncate text-[11px] font-medium', step.state === 'current' ? 'text-cyan-800' : 'text-slate-500')}>
              {step.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function AlertBanner({ alert }) {
  if (!alert) return null;
  const tone = {
    called: 'border-cyan-200 bg-cyan-50 text-cyan-900',
    next: 'border-cyan-200 bg-cyan-50 text-cyan-900',
    approaching: 'border-amber-200 bg-amber-50 text-amber-900',
    position: 'border-slate-200 bg-slate-50 text-slate-800',
    consultation: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    completed: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    cancelled: 'border-slate-200 bg-slate-100 text-slate-700',
    no_show: 'border-red-200 bg-red-50 text-red-800',
  }[alert.code] || 'border-slate-200 bg-slate-50 text-slate-800';

  return (
    <div className={classNames('rounded-2xl border px-4 py-3 text-sm font-medium', tone)}>
      {alert.message}
    </div>
  );
}

export default function PatientHome({ user, onOpenHistory }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setError('');
    try {
      const data = await api('/patient/queue-status');
      setPayload(data);
      setError('');
    } catch (err) {
      if (!silent) setError(err.message || 'Unable to load your queue status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      load(true);
    }, REFRESH_MS);
    function onVisible() {
      if (!document.hidden) load(true);
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const visit = payload?.active;
  const patient = payload?.patient;
  const line = payload?.line || [];
  const age = patient?.birth_date ? ageFromBirthDate(patient.birth_date) : null;

  return (
    <PageStack>
      {error ? (
        <PageBlock>
          <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
            <p>{error}</p>
            <button type="button" className="mt-3 text-sm font-semibold text-red-800 underline" onClick={() => load()}>
              Try again
            </button>
          </div>
        </PageBlock>
      ) : null}

      {loading && !payload ? (
        <PageBlock>
          <Card title="Queue Status" icon={Bell}>
            <p className="text-sm text-slate-500">Loading your queue…</p>
          </Card>
        </PageBlock>
      ) : null}

      {!loading && !visit ? (
        <PageBlock>
          <Card title="Queue Status" icon={Bell}>
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
              <p className="text-base font-semibold text-slate-900">No active queue</p>
              <p className="mt-1 text-sm text-slate-500">You currently don&apos;t have an active medical visit.</p>
              {onOpenHistory ? (
                <div className="mt-4">
                  <PrimaryButton type="button" onClick={onOpenHistory}>View history</PrimaryButton>
                </div>
              ) : null}
            </div>
          </Card>
        </PageBlock>
      ) : null}

      {visit ? (
        <>
          <PageBlock>
            <Card title="Your queue" icon={Bell}>
              <div className="space-y-4">
                <AlertBanner alert={visit.alert} />
                <div className="rounded-3xl bg-slate-900 px-5 py-6 text-white sm:px-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Your queue</p>
                  <p className="mt-2 font-mono text-5xl font-bold tracking-wide sm:text-6xl">{visit.queue_number || '—'}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <VisitStatusChip label={visit.status_label} />
                    <span className="text-sm text-slate-300">{visit.assigned_line || visit.department || 'Health center'}</span>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatTile label="Currently serving" value={visit.currently_serving || '—'} />
                  <StatTile label="Patients ahead" value={visit.people_ahead == null ? '—' : String(visit.people_ahead)} />
                  <StatTile label="Estimated wait" value={waitLabel(visit.estimated_wait_minutes)} />
                  <StatTile label="Status" value={visit.status_label} />
                </div>
              </div>
            </Card>
          </PageBlock>

          <PageBlock>
            <Card title="Visit details" icon={MapPin}>
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Reference</dt>
                  <dd className="font-medium text-slate-900">{visit.visit_number}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Queue position</dt>
                  <dd className="font-medium text-slate-900">{visit.people_ahead == null ? '—' : `#${visit.people_ahead + 1}`}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Department / line</dt>
                  <dd className="font-medium text-slate-900">{visit.assigned_line || visit.department || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Current status</dt>
                  <dd className="font-medium text-slate-900">{visit.status_label}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Date of visit</dt>
                  <dd className="font-medium text-slate-900">{formatDate(visit.date_of_visit)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Check-in</dt>
                  <dd className="font-medium text-slate-900">{formatDateTime(visit.check_in_at)}</dd>
                </div>
                {visit.appointment_at ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Appointment</dt>
                    <dd className="font-medium text-slate-900">{formatDateTime(visit.appointment_at)}</dd>
                  </div>
                ) : null}
                {visit.referral_reason ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Reason</dt>
                    <dd className="font-medium text-slate-900">{visit.referral_reason}</dd>
                  </div>
                ) : null}
              </dl>
            </Card>
          </PageBlock>

          <PageBlock>
            <Card title="Queue progress" icon={HeartPulse}>
              <ProgressTrack steps={visit.progress} />
            </Card>
          </PageBlock>

          <PageBlock>
            <Card title="Current queue" icon={Users}>
              {line.length === 0 ? (
                <p className="text-sm text-slate-500">The live line for this department is not available yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {line.map((entry) => (
                    <li
                      key={`${entry.queue_number}-${entry.order}`}
                      className={classNames(
                        'flex items-center justify-between gap-3 py-3',
                        entry.is_you && 'rounded-xl bg-cyan-50 px-3',
                        entry.is_serving && !entry.is_you && 'rounded-xl bg-emerald-50 px-3',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-base font-semibold text-slate-950">{entry.queue_number}</p>
                        <p className="text-xs text-slate-500">
                          {entry.is_you ? 'You' : entry.status_label}
                          {entry.position ? ` · Position ${entry.position}` : ''}
                          {entry.estimated_wait_minutes && !entry.is_serving && !entry.is_you ? ` · ~${entry.estimated_wait_minutes} min` : ''}
                        </p>
                      </div>
                      <span className={classNames(
                        'rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                        entry.is_you ? 'bg-cyan-600 text-white' : entry.is_serving ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600',
                      )}
                      >
                        {entry.is_you ? 'You' : entry.is_serving ? 'Now serving' : entry.status_label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </PageBlock>

          {visit.status === 'completed' ? (
            <PageBlock>
              <Card title="Rate this visit" icon={Star}>
                {visit.rating ? (
                  <SubmittedVisitRating rating={visit.rating} />
                ) : (
                  <VisitRatingForm visitCode={visit.visit_number} onSubmitted={() => load()} />
                )}
              </Card>
            </PageBlock>
          ) : null}
        </>
      ) : null}

      {patient ? (
        <PageBlock>
          <Card title="Your information" icon={UserRound}>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Full name</dt>
                <dd className="font-medium text-slate-900">{patient.full_name || user?.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Patient ID</dt>
                <dd className="font-medium text-slate-900">{patient.id}</dd>
              </div>
              {patient.contact_number ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Contact</dt>
                  <dd className="font-medium text-slate-900">{patient.contact_number}</dd>
                </div>
              ) : null}
              {patient.birth_date ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Birth date</dt>
                  <dd className="font-medium text-slate-900">
                    {formatDate(patient.birth_date)}{age != null ? ` · ${age} yrs` : ''}
                  </dd>
                </div>
              ) : null}
              {patient.address || patient.city ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Address</dt>
                  <dd className="font-medium text-slate-900">
                    {[patient.address, patient.address2, [patient.city, patient.province, patient.postal_code].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-4 inline-flex items-center gap-2 text-xs text-slate-400">
              <Clock3 className="h-3.5 w-3.5" />
              Updates automatically{payload?.updated_at ? ` · ${formatTime(payload.updated_at)}` : ''}
            </p>
          </Card>
        </PageBlock>
      ) : null}
    </PageStack>
  );
}
