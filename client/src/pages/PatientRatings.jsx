import { useCallback, useEffect, useState } from 'react';
import { Star, X } from 'lucide-react';
import { api } from '../api';
import { formatDate, formatTime } from '../components/helpers';
import { StarValue, SubmittedVisitRating, VisitRatingForm } from '../components/patient-visit-rating';
import { Card, PageBlock, PageStack, PrimaryButton, StatusBadge } from '../components/ui';

function TransactionFacts({ visit }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs uppercase tracking-wide text-slate-500">Transaction ID</dt>
        <dd className="font-medium text-slate-900">{visit.visit_number}</dd>
      </div>
      {visit.queue_number ? (
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Queue number</dt>
          <dd className="font-medium text-slate-900">{visit.queue_number}</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-xs uppercase tracking-wide text-slate-500">Date</dt>
        <dd className="font-medium text-slate-900">{formatDate(visit.completed_at || visit.queue_date || visit.created_at)}</dd>
      </div>
      {visit.completed_at || visit.checked_in_at ? (
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Time</dt>
          <dd className="font-medium text-slate-900">
            {formatTime(visit.checked_in_at || visit.created_at)}
            {visit.completed_at ? ` – ${formatTime(visit.completed_at)}` : ''}
          </dd>
        </div>
      ) : null}
      {visit.service ? (
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Service</dt>
          <dd className="font-medium text-slate-900">{visit.service}</dd>
        </div>
      ) : null}
      {visit.department ? (
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Department</dt>
          <dd className="font-medium text-slate-900">{visit.department}</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-xs uppercase tracking-wide text-slate-500">Status</dt>
        <dd><StatusBadge value={visit.status_label} /></dd>
      </div>
    </dl>
  );
}

function RatingModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-xl">
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

export default function PatientRatings() {
  const [awaiting, setAwaiting] = useState([]);
  const [rated, setRated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api('/patient/ratings');
      setAwaiting(data.awaiting || []);
      setRated(data.rated || []);
    } catch (err) {
      setError(err.message || 'Unable to load your ratings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageStack>
      {error ? (
        <PageBlock>
          <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
        </PageBlock>
      ) : null}

      <PageBlock>
        <Card title="Awaiting your feedback" icon={Star}>
          {loading ? <p className="text-sm text-slate-500">Loading ratings…</p> : null}
          {!loading && awaiting.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
              <p className="text-base font-semibold text-slate-900">All your completed visits have already been rated.</p>
              <p className="mt-1 text-sm text-slate-500">No transactions are waiting for feedback.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {awaiting.map((visit) => (
                <article key={visit.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Transaction</p>
                      <h3 className="mt-1 font-semibold text-slate-950">{visit.visit_number}</h3>
                      <p className="mt-1 text-sm text-slate-500">{visit.service || 'Medical Consultation'}</p>
                      <p className="text-sm text-slate-500">{formatDate(visit.completed_at || visit.queue_date || visit.created_at)}</p>
                      {visit.queue_number ? <p className="text-sm text-slate-500">Queue {visit.queue_number}</p> : null}
                    </div>
                    <StatusBadge value="Completed" />
                  </div>
                  <div className="mt-4">
                    <PrimaryButton type="button" onClick={() => setActive({ mode: 'rate', visit })}>Rate now</PrimaryButton>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      </PageBlock>

      <PageBlock>
        <Card title="Your previous ratings" icon={Star}>
          {!loading && rated.length === 0 ? (
            <p className="text-sm text-slate-500">Your feedback helps us improve our service.</p>
          ) : (
            <div className="space-y-3">
              {rated.map((visit) => (
                <article key={visit.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-950">{visit.service || visit.visit_number}</h3>
                      <p className="mt-1 text-sm text-slate-500">{formatDate(visit.completed_at || visit.created_at)}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <StarValue value={visit.rating?.rating} />
                        <span className="text-sm font-semibold text-slate-800">{visit.rating?.rating}/5</span>
                      </div>
                      {visit.rating?.comments ? <p className="mt-2 text-sm text-slate-700">“{visit.rating.comments}”</p> : null}
                    </div>
                    <PrimaryButton type="button" onClick={() => setActive({ mode: 'view', visit })}>View rating</PrimaryButton>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      </PageBlock>

      {active ? (
        <RatingModal
          title={active.mode === 'rate' ? 'Rate this transaction' : 'Your rating'}
          onClose={() => setActive(null)}
        >
          <TransactionFacts visit={active.visit} />
          <div className="mt-4">
            {active.mode === 'rate' ? (
              <VisitRatingForm
                visitCode={active.visit.visit_number}
                onSubmitted={() => {
                  setActive(null);
                  load();
                }}
              />
            ) : (
              <SubmittedVisitRating rating={active.visit.rating} />
            )}
          </div>
        </RatingModal>
      ) : null}
    </PageStack>
  );
}
