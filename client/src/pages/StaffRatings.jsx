import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Star, X } from 'lucide-react';
import { api } from '../api';
import { classNames, formatDate, formatDateTime } from '../components/helpers';
import { StarValue } from '../components/patient-visit-rating';
import {
  Card,
  PageBlock,
  PageStack,
  SearchableSelect,
  StatusBadge,
  TextInput,
  toSearchableOptions,
} from '../components/ui';
import { RATING_CATEGORIES, RATING_INTERNAL_STATUSES, SERVICE_LABELS } from '@shared/visitRatings';

const RANGE_OPTIONS = toSearchableOptions([
  { value: '', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
]);

const STAR_OPTIONS = toSearchableOptions([
  { value: '', label: 'Any rating' },
  { value: '5', label: '5 stars' },
  { value: '4', label: '4 stars' },
  { value: '3', label: '3 stars' },
  { value: '2', label: '2 stars' },
  { value: '1', label: '1 star' },
]);

const STATUS_OPTIONS = toSearchableOptions([
  { value: '', label: 'Any status' },
  ...RATING_INTERNAL_STATUSES,
]);

const FEEDBACK_OPTIONS = toSearchableOptions([
  { value: '', label: 'Any feedback' },
  { value: '1', label: 'Has written feedback' },
  { value: '0', label: 'No written feedback' },
]);

const SERVICE_OPTIONS = toSearchableOptions([
  { value: '', label: 'Any service' },
  ...Object.entries(SERVICE_LABELS).map(([value, label]) => ({ value, label })),
]);

function SummaryTile({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function RatingModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function StaffRatings() {
  const [summary, setSummary] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [filters, setFilters] = useState({
    range: '',
    from: '',
    to: '',
    rating: '',
    service: '',
    department: '',
    status: '',
    has_feedback: '',
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (!value || (key === 'from' && filters.range !== 'custom') || (key === 'to' && filters.range !== 'custom')) return;
      if (key === 'range' && value === 'custom') return;
      params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setError('');
    try {
      const suffix = queryString ? `?${queryString}` : '';
      const [list, stats] = await Promise.all([
        api(`/ratings${suffix}`),
        api(`/ratings/summary${suffix}`),
      ]);
      setRatings(list.ratings || []);
      setSummary(stats.summary || null);
    } catch (err) {
      setError(err.message || 'Unable to load ratings.');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const departments = useMemo(() => {
    const names = [...new Set(ratings.map((row) => row.department).filter(Boolean))];
    return toSearchableOptions([{ value: '', label: 'Any department' }, ...names.map((name) => ({ value: name, label: name }))]);
  }, [ratings]);

  async function saveStatus(id, status) {
    setSavingStatus(true);
    setError('');
    try {
      const result = await api(`/ratings/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ internal_status: status }),
      });
      setSelected(result.rating);
      await load();
    } catch (err) {
      setError(err.message || 'Could not update status.');
    } finally {
      setSavingStatus(false);
    }
  }

  const maxTrend = Math.max(...(summary?.trend || []).map((row) => Number(row.count || 0)), 1);

  return (
    <PageStack>
      {error ? (
        <PageBlock>
          <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
        </PageBlock>
      ) : null}

      <PageBlock>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryTile
            label="Average rating"
            value={summary?.average != null ? `${summary.average} / 5` : '—'}
            detail={summary?.total ? `${summary.total} ratings` : 'No ratings yet'}
          />
          <SummaryTile label="Total ratings" value={summary?.total ?? '—'} detail={`Response rate ${summary?.response_rate || 0}%`} />
          <SummaryTile label="5-star ratings" value={`${summary?.five_star_percent || 0}%`} detail={`${summary?.by_star?.[5] || 0} reviews`} />
          <SummaryTile label="4-star ratings" value={`${summary?.four_star_percent || 0}%`} detail={`${summary?.by_star?.[4] || 0} reviews`} />
          <SummaryTile
            label="Needs attention"
            value={summary?.needs_attention ?? '—'}
            detail={`${summary?.low_star_percent || 0}% are 1–2 stars`}
          />
        </div>
      </PageBlock>

      <PageBlock>
        <Card title="Filters" icon={Star}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SearchableSelect value={filters.range} onChange={(value) => setFilters((current) => ({ ...current, range: value }))} options={RANGE_OPTIONS} placeholder="All dates" />
            {filters.range === 'custom' ? (
              <>
                <TextInput type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
                <TextInput type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
              </>
            ) : null}
            <SearchableSelect value={filters.rating} onChange={(value) => setFilters((current) => ({ ...current, rating: value }))} options={STAR_OPTIONS} placeholder="Any rating" />
            <SearchableSelect value={filters.service} onChange={(value) => setFilters((current) => ({ ...current, service: value }))} options={SERVICE_OPTIONS} placeholder="Any service" />
            <SearchableSelect value={filters.department} onChange={(value) => setFilters((current) => ({ ...current, department: value }))} options={departments} placeholder="Any department" />
            <SearchableSelect value={filters.status} onChange={(value) => setFilters((current) => ({ ...current, status: value }))} options={STATUS_OPTIONS} placeholder="Any status" />
            <SearchableSelect value={filters.has_feedback} onChange={(value) => setFilters((current) => ({ ...current, has_feedback: value }))} options={FEEDBACK_OPTIONS} placeholder="Any feedback" />
          </div>
        </Card>
      </PageBlock>

      <PageBlock>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Service performance" icon={Star}>
            {(summary?.by_service || []).length ? (
              <ul className="space-y-3">
                {summary.by_service.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{row.label}</p>
                      <p className="text-xs text-slate-500">{row.count} rating{row.count === 1 ? '' : 's'}</p>
                    </div>
                    <div className="text-right">
                      <StarValue value={Math.round(row.average)} />
                      <p className="text-sm font-semibold text-slate-800">{row.average}/5</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No patient feedback matches the selected filters.</p>
            )}
          </Card>
          <Card title="Ratings over time" icon={Star}>
            <div className="flex h-40 items-end gap-1 rounded-2xl bg-slate-50 p-3">
              {(summary?.trend || []).map((row) => (
                <div key={row.fullLabel} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={`${row.fullLabel}: ${row.count}`}>
                  <div className="w-full rounded-t-md bg-cyan-700" style={{ height: `${Math.max(6, (Number(row.count || 0) / maxTrend) * 120)}px` }} />
                  <span className="mt-1 w-full truncate text-center text-[9px] text-slate-400">{row.label}</span>
                </div>
              ))}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {RATING_CATEGORIES.map(({ key, label }) => (
                <div key={key}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="font-semibold text-slate-900">{summary?.category_averages?.[key] != null ? `${summary.category_averages[key]}/5` : '—'}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </PageBlock>

      <PageBlock>
        <Card title="Patient ratings" icon={Star}>
          {loading ? <p className="text-sm text-slate-500">Loading ratings…</p> : null}
          {!loading && ratings.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              No patient feedback matches the selected filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Transaction</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Service</th>
                    <th className="px-3 py-2">Rating</th>
                    <th className="px-3 py-2">Feedback</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {ratings.map((row) => (
                    <tr key={row.id} className={classNames('border-b border-slate-100', row.rating <= 2 && 'bg-amber-50/60')}>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-900">{row.visit_number}</p>
                        <p className="text-xs text-slate-500">{row.patient_label}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{formatDate(row.created_at)}</td>
                      <td className="px-3 py-3 text-slate-700">{row.service}</td>
                      <td className="px-3 py-3"><StarValue value={row.rating} /></td>
                      <td className="max-w-xs px-3 py-3 text-slate-600">{row.comments ? `“${row.comments}”` : '—'}</td>
                      <td className="px-3 py-3">
                        {row.rating <= 2 || row.internal_status === 'needs_attention' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                            <AlertTriangle className="h-3 w-3" />
                            Needs attention
                          </span>
                        ) : (
                          <StatusBadge value={row.internal_status.replaceAll('_', ' ')} />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button type="button" className="text-sm font-semibold text-cyan-800 hover:underline" onClick={() => setSelected(row)}>
                          View details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PageBlock>

      {selected ? (
        <RatingModal title={selected.visit_number} onClose={() => setSelected(null)}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Date</dt>
              <dd className="font-medium text-slate-900">{formatDateTime(selected.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Department</dt>
              <dd className="font-medium text-slate-900">{selected.department || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Service</dt>
              <dd className="font-medium text-slate-900">{selected.service}</dd>
            </div>
            {selected.queue_number ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Queue number</dt>
                <dd className="font-medium text-slate-900">{selected.queue_number}</dd>
              </div>
            ) : null}
            {selected.completed_at ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Completed</dt>
                <dd className="font-medium text-slate-900">{formatDateTime(selected.completed_at)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Patient</dt>
              <dd className="font-medium text-slate-900">{selected.patient_label}</dd>
            </div>
          </dl>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Patient feedback</p>
            <div className="mt-2 flex items-center gap-2">
              <StarValue value={selected.rating} size="h-6 w-6" />
              <span className="text-sm font-semibold">{selected.rating}/5</span>
            </div>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              {RATING_CATEGORIES.map(({ key, label }) => (
                selected.categories?.[key] ? (
                  <div key={key} className="flex items-center justify-between gap-2 text-sm">
                    <dt className="text-slate-500">{label}</dt>
                    <dd><StarValue value={selected.categories[key]} /></dd>
                  </div>
                ) : null
              ))}
            </dl>
            {selected.comments ? <p className="mt-3 text-sm text-slate-700">“{selected.comments}”</p> : null}
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Internal status</p>
            <div className="flex flex-wrap gap-2">
              {RATING_INTERNAL_STATUSES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  disabled={savingStatus}
                  onClick={() => saveStatus(selected.id, item.value)}
                  className={classNames(
                    'rounded-full px-3 py-1.5 text-xs font-semibold',
                    selected.internal_status === item.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </RatingModal>
      ) : null}
    </PageStack>
  );
}
