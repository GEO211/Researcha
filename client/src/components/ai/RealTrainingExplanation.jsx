import { useEffect, useState } from 'react';
import { BrainCircuit } from 'lucide-react';
import { api } from '../../api';
import { Card } from '../ui';

function metric(metrics, key) {
  const value = metrics?.[key];
  if (value == null || value === '') return '—';
  return value;
}

export function RealTrainingExplanation({ open, onToggle }) {
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api('/ai/hourly/latest')
      .then((body) => {
        if (active) setAnalysis(body.analysis || null);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Unable to load the trained model report.');
      });
    return () => {
      active = false;
    };
  }, [open]);

  const metrics = analysis?.model_metrics || {};
  const confidence = metrics.confidence == null ? null : `${Math.round(Number(metrics.confidence) * 100)}%`;

  return (
    <Card title="Real AI training" icon={BrainCircuit}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50/60"
      >
        <span>
          <span className="block text-sm font-semibold text-slate-950">How this AI was trained</span>
          <span className="mt-1 block text-xs text-slate-500">
            {analysis?.model_version || 'Saved model'} · histogram gradient boosting on CareLink referral hours
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-cyan-800">{open ? 'Hide explanation' : 'Full explanation'}</span>
      </button>

      {open ? (
        <div className="mt-5 space-y-6 text-sm leading-relaxed text-slate-700">
          {error ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">{error}</p> : null}
          {!analysis && !error ? <p className="text-slate-500">Loading the saved training report…</p> : null}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">What was trained</h3>
            <p className="mt-2">
              The saved model is {analysis?.model_version || 'the hourly volume model'}, a scikit-learn HistGradientBoostingRegressor.
              It learns a referral count for each clock hour from earlier hours. Training uses CareLink rows in Postgres, source {metrics.source || 'carelink-referrals'}.
            </p>
            <p className="mt-2">
              The algorithm is from scikit-learn, BSD-3-Clause. The weights in this system were trained here on CareLink referrals. They were not downloaded as a ready-made model file.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <a className="font-medium text-cyan-800 underline" href="https://github.com/scikit-learn/scikit-learn" target="_blank" rel="noreferrer">
                  https://github.com/scikit-learn/scikit-learn
                </a>
              </li>
              <li>
                <a className="font-medium text-cyan-800 underline" href="https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingRegressor.html" target="_blank" rel="noreferrer">
                  HistGradientBoostingRegressor documentation
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Measured holdout</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Model version" value={analysis?.model_version || '—'} />
              <Fact label="Holdout MAE" value={metric(metrics, 'mae')} />
              <Fact label="Holdout RMSE" value={metric(metrics, 'rmse')} />
              <Fact label="Clock-hour MAE" value={metric(metrics, 'baseline_mae')} />
              <Fact label="Clock-hour RMSE" value={metric(metrics, 'baseline_rmse')} />
              <Fact label="Skill" value={confidence || '—'} />
              <Fact label="Training rows" value={metric(metrics, 'training_rows')} />
              <Fact label="Holdout rows" value={metric(metrics, 'holdout_rows')} />
              <Fact label="Hourly buckets" value={metric(metrics, 'hourly_buckets')} />
              <Fact label="Referral rows" value={metric(metrics, 'referral_rows')} />
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Skill is 1 minus model MAE divided by the clock-hour average MAE, clipped between 0 and 99%. These figures are the last successful training record, not a fixed label.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Training steps</h3>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Read referrals: timestamp, urgency, type, severity, status, and referring location.</li>
              <li>Build one row per Philippine hour, including hours with zero arrivals.</li>
              <li>For each hour after the first 168, build features that use only earlier hours.</li>
              <li>Hold out the last 168 trainable hours. Fit the booster on the rows before that.</li>
              <li>Score mean absolute error and root mean squared error on the holdout.</li>
              <li>Compare with a clock-hour average. Replace the saved file only when the new MAE is lower or equal.</li>
            </ol>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Features and target</h3>
            <p className="mt-2">Target: how many referrals were created in that hour.</p>
            <p className="mt-2">
              Features: hour of day, weekday, weekend flag, arrivals 1, 2, 3, 24, and 168 hours earlier, the mean of the previous 24 and 168 hours, and the previous hour’s emergency count, urgent count, and number of referring locations.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hourly scoring is separate from training</h3>
            <p className="mt-2">
              At 5 minutes past each hour the server loads the saved model, scores the hour that just ended, predicts the next 1, 3, 6, and 24 hours, and stores one row. The same hour is not stored twice.
              A new fit runs daily at 12:20 AM, or after 48 new referrals and at least 12 hours, and only replaces the file when holdout MAE improves.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prediction, trend, and anomaly</h3>
            <p className="mt-2">
              The next hour is one model call using actual history. Later hours reuse that predicted count as a lag, then the 3, 6, and 24 hour figures are sums.
              Trend compares the finished hour with the previous hour: increasing, decreasing, stable, or unusual.
              Anomaly requires the residual to be at least 2.5 times the holdout RMSE and at least 3 referrals.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Limits</h3>
            <p className="mt-2">
              The series is citywide referral creations. Many hours are zero, so a next-hour figure near zero can be the learned result for a quiet clock hour. Confidence stays modest while the holdout error is close to the clock-hour average. The 7-day cards on this page are a separate daily view.
            </p>
          </section>
        </div>
      ) : null}
    </Card>
  );
}

function Fact({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-bold tabular-nums text-slate-950">{value}</dd>
    </div>
  );
}
