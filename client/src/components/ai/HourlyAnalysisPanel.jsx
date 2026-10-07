import { useEffect, useState } from 'react';
import { AlertTriangle, BrainCircuit } from 'lucide-react';
import { api } from '../../api';
import { Card } from '../ui';

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatHour(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function percent(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Math.round(Number(value) * 100)}%`;
}

const TREND_CLASS = {
  increasing: 'bg-cyan-50 text-cyan-800',
  decreasing: 'bg-slate-100 text-slate-700',
  stable: 'bg-emerald-50 text-emerald-800',
  unusual: 'bg-amber-50 text-amber-900',
};

function TrendChart({ series = [] }) {
  const points = series.filter((row) => row.actual != null || row.predicted != null || row.average != null);
  if (points.length < 2) return null;
  const width = 720;
  const height = 280;
  const pad = { top: 16, right: 12, bottom: 56, left: 32 };
  const values = points.flatMap((row) => [row.actual, row.predicted, row.average].filter((value) => value != null));
  const max = Math.max(...values, 1);
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const x = (index) => pad.left + (index / Math.max(points.length - 1, 1)) * innerWidth;
  const y = (value) => pad.top + (1 - Number(value) / max) * innerHeight;
  const pathFor = (key) => points
    .map((row, index) => (row[key] == null ? null : `${index === 0 || points[index - 1][key] == null ? 'M' : 'L'} ${x(index)} ${y(row[key])}`))
    .filter(Boolean)
    .join(' ');
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className="min-w-0">
      <div className="overflow-hidden rounded-2xl bg-slate-50 p-2 sm:p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Hourly actual referrals, predictions, and historical average">
          <line x1={pad.left} y1={pad.top + innerHeight} x2={width - pad.right} y2={pad.top + innerHeight} stroke="#e2e8f0" />
          <path d={pathFor('average')} fill="none" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth="1.5" />
          <path d={pathFor('actual')} fill="none" stroke="#0e7490" strokeWidth="2.5" />
          <path d={pathFor('predicted')} fill="none" stroke="#0891b2" strokeWidth="2.5" strokeDasharray="2 3" />
          {points.map((row, index) => (
            row.actual != null ? (
              <circle key={`actual-${row.time}`} cx={x(index)} cy={y(row.actual)} r={row.anomaly ? 5 : 3} fill={row.anomaly ? '#d97706' : '#0e7490'} />
            ) : null
          ))}
          {points.map((row, index) => {
            if (index % labelStep !== 0 && index !== points.length - 1) return null;
            const labelY = height - 28;
            return (
              <text
                key={`label-${row.time}`}
                x={x(index)}
                y={labelY}
                textAnchor="end"
                fontSize="11"
                fill="#64748b"
                transform={`rotate(-40 ${x(index)} ${labelY})`}
              >
                {formatWhen(row.time)}
              </text>
            );
          })}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-cyan-700" /> Actual</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-cyan-500" /> Prediction</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed border-slate-400" /> Historical average</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-600" /> Anomaly</span>
      </div>
    </div>
  );
}

export function HourlyAnalysisPanel() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [latestBody, historyBody] = await Promise.all([
          api('/ai/hourly/latest'),
          api('/ai/hourly/history?limit=48'),
        ]);
        if (!active) return;
        setLatest(latestBody);
        setHistory(historyBody.analyses || []);
        setError('');
      } catch (requestError) {
        if (!active) return;
        setError(requestError.message || 'Unable to load the hourly analysis.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const analysis = latest?.analysis;

  return (
    <Card title="AI hourly analysis" icon={BrainCircuit}>
      {loading ? <p className="text-sm text-slate-500">Loading the latest hourly analysis…</p> : null}
      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>
      ) : null}
      {!loading && !error && !analysis ? (
        <p className="text-sm text-slate-600">
          The first hourly analysis has not been saved yet. The server runs it at 5 minutes past each hour, even when this page is closed.
        </p>
      ) : null}
      {analysis ? (
        <div className="min-w-0 space-y-5">
          <div className="flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:flex-wrap sm:gap-x-3 sm:gap-y-1">
            <span>Last analysis {formatHour(analysis.analysis_time)}</span>
            <span className="hidden sm:inline">·</span>
            <span>Next analysis {formatWhen(latest.next_analysis_at)}</span>
            <span className="hidden sm:inline">·</span>
            <span>{analysis.records_analyzed} referral rows</span>
            <span className="hidden sm:inline">·</span>
            <span>{analysis.model_version}</span>
          </div>
          {latest.last_error ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              A later run failed. Showing the last successful analysis. {latest.last_error.error_message}
            </p>
          ) : null}
          {analysis.alert_level === 'warning' ? (
            <div className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Warning: the next hour is outside the normal range for this clock hour.</p>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
            <Stat label="Current trend" value={analysis.trend || '—'} badge />
            <Stat label="Next hour" value={analysis.prediction ?? '—'} detail={`3h ${analysis.prediction_3h ?? '—'} · 6h ${analysis.prediction_6h ?? '—'} · 24h ${analysis.prediction_24h ?? '—'}`} />
            <Stat label="Confidence" value={percent(analysis.confidence)} detail="Holdout skill against the hour-of-day average" />
            <Stat label="Anomaly" value={analysis.anomaly_detected ? 'Detected' : 'None'} detail={analysis.anomaly_detected ? `Score ${analysis.anomaly_score}` : `This hour ${analysis.current_value ?? '—'}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI insight</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{analysis.insight}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommendation</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{analysis.recommendation}</p>
          </div>
          <TrendChart series={analysis.series || []} />
          {history.length ? (
            <>
              <ul className="space-y-2 md:hidden">
                {history.map((row) => (
                  <li key={row.id} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm">
                    <p className="font-medium text-slate-900">{formatHour(row.period_end)}</p>
                    <p className="mt-1 capitalize text-slate-600">{row.trend} · actual {row.current_value ?? '—'} · next hour {row.prediction ?? '—'} · {percent(row.confidence)}</p>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Time</th>
                      <th className="py-2 pr-3 font-semibold">Trend</th>
                      <th className="py-2 pr-3 font-semibold">Actual</th>
                      <th className="py-2 pr-3 font-semibold">Next hour</th>
                      <th className="py-2 font-semibold">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="whitespace-nowrap py-2 pr-3 text-slate-700">{formatHour(row.period_end)}</td>
                        <td className="py-2 pr-3 capitalize text-slate-800">{row.trend}</td>
                        <td className="py-2 pr-3 tabular-nums text-slate-700">{row.current_value ?? '—'}</td>
                        <td className="py-2 pr-3 tabular-nums text-slate-700">{row.prediction ?? '—'}</td>
                        <td className="py-2 tabular-nums text-slate-700">{percent(row.confidence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Stat({ label, value, detail, badge = false }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {badge ? (
        <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-sm font-semibold capitalize ${TREND_CLASS[value] || TREND_CLASS.stable}`}>{value}</p>
      ) : (
        <p className="mt-1 break-words text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
      )}
      {detail ? <p className="mt-1 break-words text-xs leading-relaxed text-slate-500">{detail}</p> : null}
    </div>
  );
}
