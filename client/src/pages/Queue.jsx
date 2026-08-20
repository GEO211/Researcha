import { useCallback, useEffect, useState } from 'react';
import { Bell, CalendarDays, Filter, RefreshCw, Search } from 'lucide-react';
import { api } from '../api';
import { classNames, priorityLabel } from '../components/helpers';
import {
  AnimatedTableRow,
  Card,
  CountUp,
  Field,
  FilterPanel,
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
  { id: 'active', label: 'Active referrals' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last_7_days', label: 'Last 7 days' },
  { id: 'last_30_days', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom date' },
  { id: 'all', label: 'All dates' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All queue statuses' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'called', label: 'Called' },
  { value: 'served', label: 'Served' },
  { value: 'missed', label: 'Missed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

const REFERRAL_STATUS_OPTIONS = [
  { value: 'all', label: 'All referral statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'completed', label: 'Completed' },
  { value: 'missed', label: 'Missed' },
  { value: 'archived', label: 'Archived' },
  { value: 'expired', label: 'Expired' },
];

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'All priorities' },
  { value: 'priority_1_emergency', label: 'Emergency' },
  { value: 'priority_2_vulnerable', label: 'Vulnerable' },
  { value: 'priority_3_standard', label: 'Standard' },
];

const queueStatusOptions = toSearchableOptions(STATUS_OPTIONS);
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  // DATE columns often serialize as UTC midnight; render in CareLink timezone.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
}

export default function Queue({ onRefresh }) {
  const confirm = useConfirm();
  const [queue, setQueue] = useState([]);
  const [meta, setMeta] = useState({ total: 0, counts: {}, range: 'today' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [callingId, setCallingId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [filters, setFilters] = useState({
    range: 'active',
    date: '',
    status: 'all',
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
        status: filters.status,
        priority: filters.priority,
        referral_status: filters.referral_status,
      });
      if (filters.range === 'custom' && filters.date) params.set('date', filters.date);
      if (filters.q.trim()) params.set('q', filters.q.trim());

      const data = await api(`/queue?${params.toString()}`);
      setQueue(data.queue || []);
      setMeta(data.meta || { total: (data.queue || []).length, counts: {}, range: filters.range });
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

  const counts = meta.counts || {};
  const summaryCards = [
    ['Total', meta.total || queue.length, 'Matching DB rows'],
    ['Waiting', counts.waiting || 0, 'In line now'],
    ['Called', counts.called || 0, 'Notified'],
    ['Served', counts.served || 0, 'Completed visits'],
    ['Missed', counts.missed || 0, 'Needs follow-up'],
  ];

  const rangeLabel = RANGE_OPTIONS.find((row) => row.id === filters.range)?.label || 'Today';
  const dateSubtitle = filters.range === 'active'
    ? 'Synced with Referral Records · queued'
    : (meta.from_date && meta.to_date
      ? (meta.from_date === meta.to_date
        ? meta.from_date
        : `${meta.from_date} → ${meta.to_date}`)
      : 'All queue dates');

  return (
    <PageStack>
      <PageBlock>
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60 sm:rounded-3xl">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 px-1">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Priority Queue</h2>
              <p className="text-sm text-slate-500">
                Live from referral records · {rangeLabel}
                {dateSubtitle ? ` · ${dateSubtitle}` : ''}
              </p>
            </div>
            <PrimaryButton type="button" disabled={loading} onClick={loadQueue}>
              <span className="inline-flex items-center gap-2">
                <RefreshCw className={classNames('h-4 w-4', loading ? 'animate-spin' : '')} />
                {loading ? 'Loading…' : 'Refresh'}
              </span>
            </PrimaryButton>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((option) => {
              const active = filters.range === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, range: option.id }))}
                  className={classNames(
                    'rounded-xl border px-3 py-2 text-sm font-semibold transition',
                    active
                      ? 'border-cyan-200 bg-cyan-50 text-cyan-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-200 hover:bg-slate-50',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <FilterPanel
            title="Queue filters"
            description="Queue entries are joined to real Referral Records in Supabase."
          >
            {filters.range === 'custom' ? (
              <Field label="Custom date">
                <TextInput
                  type="date"
                  value={filters.date}
                  onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
                />
              </Field>
            ) : (
              <Field label="Date window">
                <div className="flex h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                  <CalendarDays className="h-4 w-4 text-cyan-700" />
                  <span>{dateSubtitle}</span>
                </div>
              </Field>
            )}
            <Field label="Queue status">
              <SearchableSelect
                value={filters.status}
                onChange={(nextValue) => setFilters((current) => ({ ...current, status: nextValue }))}
                options={queueStatusOptions}
                placeholder="All queue statuses"
                searchPlaceholder="Search queue status…"
              />
            </Field>
            <Field label="Referral status">
              <SearchableSelect
                value={filters.referral_status}
                onChange={(nextValue) => setFilters((current) => ({ ...current, referral_status: nextValue }))}
                options={referralStatusOptions}
                placeholder="All referral statuses"
                searchPlaceholder="Search referral status…"
              />
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
            <Field label="Search">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <TextInput
                  className="pl-9"
                  placeholder="Patient, queue #, referral code…"
                  value={filters.q}
                  onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                />
              </div>
            </Field>
          </FilterPanel>
        </section>
      </PageBlock>

      <PageBlock>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map(([label, value, detail]) => (
            <div
              key={label}
              className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/50"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-slate-950">
                <CountUp to={Number(value || 0)} duration={1} />
              </p>
              <p className="mt-1 text-xs text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
      </PageBlock>

      <PageBlock>
        <Card title="Queue entries" icon={Bell}>
          <FlashMessage message={error} type="error" className="mb-4" />
          <FlashMessage message={success} type="success" className="mb-4" />

          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Filter className="h-3.5 w-3.5 text-cyan-700" />
            <span>
              Showing {queue.length} row{queue.length === 1 ? '' : 's'} synced with Referral Records
              {meta.data_source ? ` · ${meta.data_source}` : ''}
            </span>
          </div>

          {loading ? (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Loading queue from referral records…</p>
          ) : queue.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              No queue entries match these filters. Open Referral Records to confirm queued referrals, or try another date range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-2">Date</th>
                    <th className="p-2">Queue #</th>
                    <th className="p-2">Patient</th>
                    <th className="p-2">Referring center</th>
                    <th className="p-2">Priority</th>
                    <th className="p-2">Queue</th>
                    <th className="p-2">Referral</th>
                    <th className="p-2">Code</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((entry, index) => {
                    const callable = canCallPatient(entry);
                    const cooldown = callCooldownSeconds(entry.called_at, now);
                    const isCalling = callingId === entry.id;

                    return (
                      <AnimatedTableRow key={entry.id} index={index}>
                        <td className="p-2 font-mono text-xs text-slate-600">{formatQueueDate(entry.queue_date)}</td>
                        <td className="p-2 font-mono text-xs text-slate-800">{entry.queue_number}</td>
                        <td className="p-2 text-slate-800">{queuePatientName(entry)}</td>
                        <td className="p-2 text-slate-600">{entry.referring_center_name || '—'}</td>
                        <td className="p-2">{priorityLabel(entry.priority_level)}</td>
                        <td className="p-2"><StatusBadge value={queueStatus(entry)} /></td>
                        <td className="p-2"><StatusBadge value={entry.referral_status || 'unknown'} /></td>
                        <td className="p-2 font-mono text-xs text-slate-500">{entry.referral_code || '—'}</td>
                        <td className="p-2">
                          {callable ? (
                            cooldown > 0 ? (
                              <span className="text-xs font-medium text-slate-500">
                                Call again in {cooldown}s
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="font-medium text-cyan-700 disabled:opacity-50"
                                disabled={isCalling}
                                onClick={() => callPatient(entry.id)}
                              >
                                {isCalling ? 'Sending…' : 'Call patient'}
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-slate-400">
                              {entry.referral_status === 'queued' ? 'No actions' : 'History only'}
                            </span>
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
