import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { api } from '../api';
import { classNames, priorityLabel } from '../components/helpers';
import {
  AnimatedTableRow,
  Card,
  Field,
  FlashMessage,
  PageBlock,
  PageStack,
  PrimaryButton,
  SearchableSelect,
  StatusBadge,
  TextInput,
  toSearchableOptions,
  useConfirm,
} from '../components/ui';

const CALL_COOLDOWN_MS = 60_000;

const RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'active', label: 'In line' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last_7_days', label: 'Last 7 days' },
  { id: 'last_30_days', label: 'Last 30 days' },
  { id: 'all', label: 'All dates' },
  { id: 'custom', label: 'Pick a date' },
];

const QUEUE_VIEWS = [
  { id: 'all', label: 'All', hint: 'Every visit in this period' },
  { id: 'waiting', label: 'Waiting', hint: 'Not called yet' },
  { id: 'called', label: 'Called', hint: 'Patient was notified' },
  { id: 'served', label: 'Served', hint: 'Visit finished' },
  { id: 'missed', label: 'Missed', hint: 'Did not arrive' },
];

const REFERRAL_STATUS_OPTIONS = [
  { value: 'all', label: 'All referral statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'completed', label: 'Completed' },
  { value: 'missed', label: 'Missed' },
  { value: 'archived', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'All priorities' },
  { value: 'priority_1_emergency', label: 'Emergency' },
  { value: 'priority_2_vulnerable', label: 'Vulnerable' },
  { value: 'priority_3_standard', label: 'Standard' },
];

const referralStatusOptions = toSearchableOptions(REFERRAL_STATUS_OPTIONS);
const priorityOptions = toSearchableOptions(PRIORITY_OPTIONS);

function queuePatientName(entry) {
  if (entry.patient_name) return entry.patient_name;
  const name = [entry.first_name, entry.last_name].filter(Boolean).join(' ').trim();
  return name || '—';
}

function queueStatus(entry) {
  return entry.status || entry.queue_status || 'unknown';
}

function canCallPatient(entry) {
  return entry.referral_status === 'queued' && ['waiting', 'called'].includes(queueStatus(entry));
}

function callCooldownSeconds(calledAt, now) {
  if (!calledAt) return 0;
  const calledMs = new Date(calledAt).getTime();
  const remaining = CALL_COOLDOWN_MS - (now - calledMs);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

function formatQueueDate(value) {
  if (!value) return '—';
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? `${value}T12:00:00`
    : value;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function queueSummary(range, rows) {
  const period = RANGE_OPTIONS.find((option) => option.id === range)?.label || 'This list';
  if (!rows.length) {
    if (range === 'active') return 'No one is waiting or has been called. Finished visits stay under Today or All dates.';
    if (range === 'today') return 'No visits for today. A patient appears here after a referral is approved and queued.';
    return `${period}. No visits in this list.`;
  }
  const parts = [
    ['waiting', 'waiting'],
    ['called', 'called'],
    ['served', 'served'],
    ['missed', 'missed'],
    ['expired', 'expired'],
    ['cancelled', 'cancelled'],
  ].flatMap(([status, label]) => {
    const count = rows.filter((entry) => queueStatus(entry) === status).length;
    return count ? [`${count} ${label}`] : [];
  });
  const detail = parts.length === 0
    ? 'none are still open'
    : parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  return `${period}. ${rows.length} visit${rows.length === 1 ? '' : 's'}: ${detail}.`;
}

export default function Queue({ onRefresh }) {
  const confirm = useConfirm();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [callingId, setCallingId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState('all');
  const [filters, setFilters] = useState({
    range: 'today',
    date: '',
    priority: 'all',
    referral_status: 'all',
    q: '',
  });

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        range: filters.range,
        status: 'all',
        priority: filters.priority,
        referral_status: filters.referral_status,
      });
      if (filters.range === 'custom' && filters.date) params.set('date', filters.date);
      if (filters.q.trim()) params.set('q', filters.q.trim());

      const data = await api(`/queue?${params.toString()}`);
      setQueue(data.queue || []);
    } catch (err) {
      setQueue([]);
      setError(err.message || 'Unable to load queue from the database.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadQueue();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadQueue]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function callPatient(id) {
    const confirmed = await confirm({
      title: 'Call patient?',
      message: 'Send an SMS and email notification to call this patient?',
      confirmLabel: 'Call patient',
    });
    if (!confirmed) return;

    setError('');
    setSuccess('');
    setCallingId(id);
    try {
      const data = await api(`/queue/${id}/call`, { method: 'POST' });
      setSuccess(data.message || 'Call notification sent to patient.');
      await loadQueue();
      if (onRefresh) await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setCallingId(null);
    }
  }

  const viewCounts = QUEUE_VIEWS.reduce((acc, item) => {
    acc[item.id] = item.id === 'all'
      ? queue.length
      : queue.filter((entry) => queueStatus(entry) === item.id).length;
    return acc;
  }, {});
  const visibleQueue = view === 'all'
    ? queue
    : queue.filter((entry) => queueStatus(entry) === view);
  const viewCopy = QUEUE_VIEWS.find((item) => item.id === view) || QUEUE_VIEWS[0];

  return (
    <PageStack>
      <PageBlock>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm text-slate-600">{loading ? 'Loading visits…' : queueSummary(filters.range, queue)}</p>
          <PrimaryButton type="button" disabled={loading} onClick={loadQueue}>
            <span className="inline-flex items-center gap-2">
              <RefreshCw className={classNames('h-4 w-4', loading ? 'animate-spin' : '')} />
              {loading ? 'Loading…' : 'Refresh'}
            </span>
          </PrimaryButton>
        </div>
      </PageBlock>

      <PageBlock>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1">
              {RANGE_OPTIONS.map((option) => {
                const selected = filters.range === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFilters((current) => ({ ...current, range: option.id }))}
                    className={classNames(
                      'rounded-lg px-3 py-2 text-sm font-semibold transition',
                      selected ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {filters.range === 'custom' ? (
              <TextInput
                type="date"
                aria-label="Queue date"
                value={filters.date}
                onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
                className="w-auto"
              />
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {QUEUE_VIEWS.map((item) => {
              const selected = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={classNames(
                    'rounded-2xl border px-4 py-3 text-left transition',
                    selected
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300',
                  )}
                >
                  <p className={classNames('text-xs font-medium', selected ? 'text-slate-300' : 'text-slate-500')}>{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{viewCounts[item.id] || 0}</p>
                  <p className={classNames('mt-1 text-xs', selected ? 'text-slate-300' : 'text-slate-500')}>{item.hint}</p>
                </button>
              );
            })}
          </div>
        </div>
      </PageBlock>

      <PageBlock>
        <Card title={view === 'all' ? 'Visits' : viewCopy.label}>
          <p className="mb-4 text-sm text-slate-500">
            {view === 'all'
              ? 'Newest queue dates first. A visit expires after its queue day ends.'
              : viewCopy.hint}
          </p>
          <FlashMessage message={error} type="error" className="mb-4" />
          <FlashMessage message={success} type="success" className="mb-4" />

          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Field label="Search">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <TextInput
                  className="pl-9"
                  placeholder="Patient, queue number, or code"
                  value={filters.q}
                  onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                />
              </div>
            </Field>
            <Field label="Priority">
              <SearchableSelect
                value={filters.priority}
                onChange={(nextValue) => setFilters((current) => ({ ...current, priority: nextValue }))}
                options={priorityOptions}
                placeholder="All priorities"
                searchPlaceholder="Search priority…"
              />
            </Field>
            <Field label="Referral">
              <SearchableSelect
                value={filters.referral_status}
                onChange={(nextValue) => setFilters((current) => ({ ...current, referral_status: nextValue }))}
                options={referralStatusOptions}
                placeholder="All referrals"
                searchPlaceholder="Search referral status…"
              />
            </Field>
          </div>

          {loading ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">Loading visits…</p>
          ) : visibleQueue.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-800">
                {queue.length === 0 ? 'No visits in this period' : `No ${viewCopy.label.toLowerCase()} visits`}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {queue.length === 0
                  ? 'Try Yesterday or All dates. Open visits expire after their queue day ends.'
                  : 'Choose All to see the other visits in this period.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="border-y border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Queue</th>
                    <th className="px-3 py-2 font-medium">Patient</th>
                    <th className="px-3 py-2 font-medium">Home barangay</th>
                    <th className="px-3 py-2 font-medium">Checkup</th>
                    <th className="px-3 py-2 font-medium">Priority</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Referral</th>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleQueue.map((entry, index) => {
                    const callable = canCallPatient(entry);
                    const cooldown = callCooldownSeconds(entry.called_at, now);
                    const isCalling = callingId === entry.id;

                    return (
                      <AnimatedTableRow key={entry.id} index={index}>
                        <td className="px-3 py-3 text-slate-700">{formatQueueDate(entry.queue_date)}</td>
                        <td className="px-3 py-3 font-medium text-slate-900">{entry.queue_number}</td>
                        <td className="px-3 py-3 font-medium text-slate-900">{queuePatientName(entry)}</td>
                        <td className="px-3 py-3 text-slate-600">{entry.home_barangay || '—'}</td>
                        <td className="px-3 py-3 text-slate-600">{entry.checkup_location || entry.receiving_center_name || '—'}</td>
                        <td className="px-3 py-3 text-slate-700">{priorityLabel(entry.priority_level)}</td>
                        <td className="px-3 py-3"><StatusBadge value={queueStatus(entry)} /></td>
                        <td className="px-3 py-3"><StatusBadge value={entry.referral_status || 'unknown'} /></td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-500">{entry.referral_code || '—'}</td>
                        <td className="px-3 py-3">
                          {callable ? (
                            cooldown > 0 ? (
                              <span className="text-xs font-medium text-slate-500">
                                Call again in {cooldown}s
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                disabled={isCalling}
                                onClick={() => callPatient(entry.id)}
                              >
                                {isCalling ? 'Sending…' : 'Call patient'}
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-slate-400">Finished</span>
                          )}
                        </td>
                      </AnimatedTableRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PageBlock>
    </PageStack>
  );
}
