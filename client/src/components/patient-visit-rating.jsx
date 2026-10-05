import { useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '../api';
import { classNames, formatDateTime } from './helpers';
import { PrimaryButton } from './ui';
import { RATING_CATEGORIES, RATING_LABELS } from '@shared/visitRatings';

export function StarValue({ value = 0, size = 'h-5 w-5' }) {
  const score = Number(value) || 0;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((item) => (
        <Star
          key={item}
          className={classNames(size, item <= score ? 'fill-amber-400 text-amber-400' : 'text-slate-300')}
        />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange, size = 'h-8 w-8 sm:h-9 sm:w-9' }) {
  const [hover, setHover] = useState(0);
  const selected = hover || value;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {[1, 2, 3, 4, 5].map((item) => (
        <button
          key={item}
          type="button"
          className="rounded-lg p-0.5 transition hover:scale-110"
          onMouseEnter={() => setHover(item)}
          onMouseLeave={() => setHover(0)}
          onFocus={() => setHover(item)}
          onBlur={() => setHover(0)}
          onClick={() => onChange(item)}
          aria-label={`${item} star${item === 1 ? '' : 's'} — ${RATING_LABELS[item]}`}
        >
          <Star className={classNames(size, item <= selected ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
        </button>
      ))}
    </div>
  );
}

export function SubmittedVisitRating({ rating }) {
  if (!rating) {
    return <p className="text-sm text-slate-500">Your feedback helps us improve our service.</p>;
  }

  const categories = rating.categories || {};

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your experience</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StarValue value={rating.rating} size="h-6 w-6" />
        <span className="text-sm font-semibold text-slate-800">{rating.rating}/5 — {RATING_LABELS[rating.rating]}</span>
      </div>
      {RATING_CATEGORIES.some(({ key }) => categories[key]) ? (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {RATING_CATEGORIES.map(({ key, label }) => (
            categories[key] ? (
              <div key={key} className="flex items-center justify-between gap-2">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd><StarValue value={categories[key]} /></dd>
              </div>
            ) : null
          ))}
        </dl>
      ) : null}
      {rating.comments ? <p className="mt-3 text-sm text-slate-700">“{rating.comments}”</p> : null}
      <p className="mt-2 text-xs text-slate-500">Submitted {formatDateTime(rating.created_at)}</p>
    </div>
  );
}

export function VisitRatingForm({ visitCode, onSubmitted }) {
  const [score, setScore] = useState(0);
  const [categories, setCategories] = useState({});
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
        body: JSON.stringify({
          rating: score,
          comments,
          categories: { ...categories, overall: categories.overall || score },
        }),
      });
      setSuccess('Thank you for your feedback.');
      onSubmitted?.(result.rating);
    } catch (err) {
      setError(err.message || 'Could not submit your rating.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-950">How was your experience?</p>
        <p className="mt-1 text-xs text-slate-500">Your feedback helps us improve our service.</p>
        <div className="mt-3">
          <StarPicker value={score} onChange={setScore} size="h-9 w-9 sm:h-10 sm:w-10" />
        </div>
        <p className="mt-2 text-sm font-medium text-slate-700">
          {score ? `Selected: ${score} / 5 — ${RATING_LABELS[score]}` : 'Tap a star to rate'}
        </p>
      </div>

      <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
        {RATING_CATEGORIES.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700">{label}</p>
            <StarPicker
              value={categories[key] || 0}
              onChange={(value) => setCategories((current) => ({ ...current, [key]: value }))}
              size="h-6 w-6"
            />
          </div>
        ))}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tell us about your experience (optional)</span>
        <textarea
          value={comments}
          onChange={(event) => setComments(event.target.value.slice(0, 1000))}
          rows={3}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
          placeholder="Staff were accommodating, waiting time, cleanliness…"
        />
      </label>
      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      {success ? <p className="text-sm font-medium text-emerald-700">{success}</p> : null}
      <PrimaryButton disabled={submitting || !score}>{submitting ? 'Submitting…' : 'Submit rating'}</PrimaryButton>
    </form>
  );
}
