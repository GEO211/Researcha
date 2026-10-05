import { useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '../api';
import { classNames, formatDateTime } from './helpers';
import { PrimaryButton } from './ui';

const RATING_LABELS = {
  1: 'Very Poor',
  2: 'Poor',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

export function SubmittedVisitRating({ rating }) {
  if (!rating) {
    return <p className="text-sm text-slate-500">Your feedback helps us improve our service.</p>;
  }

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your experience</p>
      <div className="mt-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <Star
            key={value}
            className={classNames('h-6 w-6', value <= rating.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')}
          />
        ))}
        <span className="ml-2 text-sm font-semibold text-slate-800">{rating.rating}/5 — {RATING_LABELS[rating.rating]}</span>
      </div>
      {rating.comments ? <p className="mt-3 text-sm text-slate-700">“{rating.comments}”</p> : null}
      <p className="mt-2 text-xs text-slate-500">Submitted {formatDateTime(rating.created_at)}</p>
    </div>
  );
}

export function VisitRatingForm({ visitCode, onSubmitted }) {
  const [score, setScore] = useState(0);
  const [hover, setHover] = useState(0);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const selected = hover || score;

  async function submit(event) {
    event.preventDefault();
    if (!score) {
      setError('Choose a rating from 1 to 5.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const result = await api(`/patient/history/${encodeURIComponent(visitCode)}/rating`, {
        method: 'POST',
        body: JSON.stringify({ rating: score, comments }),
      });
      setSuccess('Thank you. Your rating was submitted.');
      onSubmitted?.(result.rating);
    } catch (err) {
      setError(err.message || 'Could not submit your rating.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-950">How was your experience?</p>
      <p className="mt-1 text-xs text-slate-500">Your feedback helps us improve our service.</p>
      <div className="mt-4 flex flex-wrap items-center gap-1">
        {[1, 2, 3, 4, 5].map((value) => {
          const active = value <= selected;
          return (
            <button
              key={value}
              type="button"
              className="rounded-lg p-1 transition hover:scale-110"
              onMouseEnter={() => setHover(value)}
              onMouseLeave={() => setHover(0)}
              onFocus={() => setHover(value)}
              onBlur={() => setHover(0)}
              onClick={() => setScore(value)}
              aria-label={`${value} star${value === 1 ? '' : 's'} — ${RATING_LABELS[value]}`}
            >
              <Star className={classNames('h-9 w-9 sm:h-10 sm:w-10', active ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm font-medium text-slate-700">
        {score ? `Selected: ${score} / 5 — ${RATING_LABELS[score]}` : 'Tap a star to rate'}
      </p>
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tell us about your experience (optional)</span>
        <textarea
          value={comments}
          onChange={(event) => setComments(event.target.value.slice(0, 1000))}
          rows={3}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
          placeholder="Staff accommodation, waiting time, cleanliness, courtesy…"
        />
      </label>
      {error ? <p className="mt-2 text-sm font-medium text-red-600">{error}</p> : null}
      {success ? <p className="mt-2 text-sm font-medium text-emerald-700">{success}</p> : null}
      <div className="mt-4">
        <PrimaryButton disabled={submitting || !score}>{submitting ? 'Submitting…' : 'Submit rating'}</PrimaryButton>
      </div>
    </form>
  );
}
