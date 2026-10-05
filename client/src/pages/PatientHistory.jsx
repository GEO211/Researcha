import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronLeft, Circle, ClipboardList, History } from 'lucide-react';
import { api } from '../api';
import { classNames, formatDate, formatDateTime, formatTime } from '../components/helpers';
import { SubmittedVisitRating, VisitRatingForm } from '../components/patient-visit-rating';
import { Card, PageBlock, PageStack, PrimaryButton, StatusBadge } from '../components/ui';

function VisitTimeline({ timeline = [], progress = [] }) {
  const items = timeline.length
    ? timeline
    : progress.map((step) => ({ id: step.id, label: step.label, at: null, done: step.state === 'done' || step.state === 'current' }));

  if (!items.length) return <p className="text-sm text-slate-500">No timeline is available for this visit.</p>;

  return (
    <ol className="space-y-3">
      {items.map((step) => {
        const Icon = step.done === false ? Circle : CheckCircle2;
        return (
          <li key={step.id} className="flex items-start gap-3">
            <Icon className={classNames('mt-0.5 h-5 w-5', step.done === false ? 'text-slate-300' : 'text-emerald-600')} />
            <div>
              <p className="text-sm font-medium text-slate-900">{step.label}</p>
              {step.at ? <p className="text-xs text-slate-500">{formatDateTime(step.at)}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function VisitCard({ visit, onOpen }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Medical visit</p>
          <h3 className="mt-1 font-semibold text-slate-950">{visit.visit_number}</h3>
          <p className="mt-1 text-sm text-slate-500">{formatDate(visit.queue_date || visit.created_at)}</p>
        </div>
        <StatusBadge value={visit.status_label} />
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        {visit.department ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Department</dt>
            <dd className="font-medium text-slate-900">{visit.department}</dd>
          </div>
        ) : null}
        {visit.queue_number ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Queue number</dt>
            <dd className="font-medium text-slate-900">{visit.queue_number}</dd>
          </div>
        ) : null}
        {visit.referral_reason ? (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Reason</dt>
            <dd className="font-medium text-slate-900">{visit.referral_reason}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Time</dt>
          <dd className="font-medium text-slate-900">
            {formatTime(visit.checked_in_at || visit.created_at)}
            {visit.completed_at ? ` – ${formatTime(visit.completed_at)}` : ''}
          </dd>
        </div>
      </dl>
      <div className="mt-4">
        <PrimaryButton type="button" onClick={() => onOpen(visit)}>View details</PrimaryButton>
      </div>
    </article>
  );
}

export default function PatientHistory() {
  const [visits, setVisits] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const loadList = useCallback(async () => {
    setError('');
    try {
      const data = await api('/patient/history');
      setVisits(data.visits || []);
    } catch (err) {
      setError(err.message || 'Unable to load your visit history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function openVisit(visit) {
    setDetailLoading(true);
    setError('');
    try {
      const data = await api(`/patient/history/${encodeURIComponent(visit.visit_number)}`);
      setSelected(data.visit);
    } catch (err) {
      setError(err.message || 'Unable to load this visit.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshSelected() {
    if (!selected) return;
    const data = await api(`/patient/history/${encodeURIComponent(selected.visit_number)}`);
    setSelected(data.visit);
    await loadList();
  }

  if (selected) {
    return (
      <PageStack>
        <PageBlock>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            All visits
          </button>
          {detailLoading ? <p className="text-sm text-slate-500">Loading visit details…</p> : null}
          {error ? <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
          <Card title={selected.visit_number} icon={ClipboardList}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={selected.status_label} />
              {selected.department ? <span className="text-sm text-slate-500">{selected.department}</span> : null}
              {selected.assigned_line && selected.assigned_line !== selected.department ? (
                <span className="text-sm text-slate-500">{selected.assigned_line}</span>
              ) : null}
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Date</dt>
                <dd className="font-medium text-slate-900">{formatDate(selected.queue_date || selected.created_at)}</dd>
              </div>
              {selected.queue_number ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Queue number</dt>
                  <dd className="font-medium text-slate-900">{selected.queue_number}</dd>
                </div>
              ) : null}
              {selected.referral_reason ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Reason</dt>
                  <dd className="font-medium text-slate-900">{selected.referral_reason}</dd>
                </div>
              ) : null}
              {selected.completed_at ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Completed</dt>
                  <dd className="font-medium text-slate-900">{formatDateTime(selected.completed_at)}</dd>
                </div>
              ) : null}
            </dl>
          </Card>
        </PageBlock>
        <PageBlock>
          <Card title="Visit timeline" icon={History}>
            <VisitTimeline timeline={selected.timeline} progress={selected.progress} />
          </Card>
        </PageBlock>
        {selected.status === 'completed' || selected.can_rate || selected.rating ? (
          <PageBlock>
            <Card title="Your experience" icon={ClipboardList}>
              {selected.rating ? (
                <SubmittedVisitRating rating={selected.rating} />
              ) : selected.can_rate ? (
                <VisitRatingForm visitCode={selected.visit_number} onSubmitted={refreshSelected} />
              ) : (
                <p className="text-sm text-slate-500">Your feedback helps us improve our service.</p>
              )}
            </Card>
          </PageBlock>
        ) : null}
      </PageStack>
    );
  }

  return (
    <PageStack>
      <PageBlock>
        <Card title="Visit history" icon={History}>
          {error ? <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
          {loading ? <p className="text-sm text-slate-500">Loading history…</p> : null}
          {!loading && visits.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
              <p className="text-base font-semibold text-slate-900">No medical visit history yet.</p>
              <p className="mt-1 text-sm text-slate-500">Completed and previous visits will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visits.map((visit) => (
                <VisitCard key={visit.id} visit={visit} onOpen={openVisit} />
              ))}
            </div>
          )}
        </Card>
      </PageBlock>
    </PageStack>
  );
}
