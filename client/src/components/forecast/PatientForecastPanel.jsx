import { createElement, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Clock3,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api } from '../../api';
import {
  Card,
  MotionItem,
  MotionReveal,
  MotionStagger,
  PrimaryButton,
  fadeUp,
  popUp,
} from '../ui';

const DISCLAIMER = 'Forecasts are estimates based on historical registration data and are intended to support operational planning. They do not constitute medical diagnosis, clinical prediction, or treatment recommendations.';

function formatDate(value, options = {}) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
}

function formatWeekday(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-PH', { weekday: 'short' })
    .format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
}

function formatHour(hour) {
  if (hour == null) return 'Unavailable';
  const normalized = Number(hour) % 24;
  if (normalized === 0) return '12 AM';
  if (normalized === 12) return '12 PM';
  return normalized > 12 ? `${normalized - 12} PM` : `${normalized} AM`;
}

function loadLabel(value) {
  return String(value || 'unavailable').replaceAll('_', ' ').toUpperCase();
}

function ForecastStat({ label, value, detail, icon }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm shadow-slate-200/50">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
          {createElement(icon, { className: 'h-4 w-4' })}
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function BarRows({ rows, valueKey = 'value', suffix = '' }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const value = Number(row[valueKey] || 0);
        return (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="capitalize text-slate-600">{row.label}</span>
              <span className="font-semibold tabular-nums text-slate-900">{value}{suffix}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-800"
                style={{ width: `${Math.max(value ? 5 : 0, (value / max) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ForecastTrendChart({ actual = [], forecasts = [] }) {
  const actualRows = actual.slice(-14).map((row) => ({
    date: row.date,
    value: Number(row.actual || 0),
    lower: Number(row.actual || 0),
    upper: Number(row.actual || 0),
    type: 'actual',
  }));
  const forecastRows = forecasts.map((row) => ({
    date: row.date,
    value: Number(row.expected || 0),
    lower: Number(row.lower || 0),
    upper: Number(row.upper || 0),
    type: 'forecast',
  }));
  const rows = [...actualRows, ...forecastRows];
  if (!rows.length) return <p className="text-sm text-slate-500">No daily demand data yet.</p>;

  const slot = 58;
  const padding = { left: 36, right: 16, top: 36, bottom: 48 };
  const width = padding.left + padding.right + rows.length * slot;
  const height = 320;
  const values = rows.flatMap((row) => [row.value, row.upper || 0]);
  const max = Math.max(...values, 1);
  const plotHeight = height - padding.top - padding.bottom;
  const y = (value) => height - padding.bottom - ((Number(value || 0) / max) * plotHeight);
  const barWidth = 22;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-2"><span className="h-2.5 w-3 rounded-sm bg-slate-700" />Actual day</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-3 rounded-sm bg-cyan-600" />Forecast day</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-3 rounded-sm bg-cyan-100 ring-1 ring-cyan-200" />Daily range</span>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-slate-50 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-full" style={{ minWidth: `${width}px`, height: '320px' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={y(max * ratio)}
                x2={width - padding.right}
                y2={y(max * ratio)}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text x="6" y={y(max * ratio) + 4} fontSize="10" fill="#64748b">{Math.round(max * ratio)}</text>
            </g>
          ))}
          {actualRows.length && forecastRows.length ? (
            <g>
              <line
                x1={padding.left + actualRows.length * slot}
                y1={padding.top - 8}
                x2={padding.left + actualRows.length * slot}
                y2={height - padding.bottom}
                stroke="#0891b2"
                strokeDasharray="3 4"
              />
              <text
                x={padding.left + actualRows.length * slot + 8}
                y="16"
                fontSize="10"
                fontWeight="700"
                fill="#0e7490"
              >
                FUTURE
              </text>
            </g>
          ) : null}
          {rows.map((row, index) => {
            const center = padding.left + index * slot + slot / 2;
            const barX = center - barWidth / 2;
            const valueY = y(row.value);
            const upperY = y(row.upper);
            const lowerY = y(row.lower);
            const isForecast = row.type === 'forecast';
            return (
              <g key={`${row.type}-${row.date}`}>
                {isForecast && row.upper !== row.lower ? (
                  <rect
                    x={center - 7}
                    y={upperY}
                    width="14"
                    height={Math.max(2, lowerY - upperY)}
                    rx="7"
                    fill="#cffafe"
                  />
                ) : null}
                <rect
                  x={barX}
                  y={valueY}
                  width={barWidth}
                  height={Math.max(3, y(0) - valueY)}
                  rx="6"
                  fill={isForecast ? '#0891b2' : '#334155'}
                />
                <text x={center} y={valueY - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">
                  {row.value}
                </text>
                <text x={center} y={height - 28} textAnchor="middle" fontSize="10" fontWeight="700" fill="#334155">
                  {formatWeekday(row.date)}
                </text>
                <text x={center} y={height - 14} textAnchor="middle" fontSize="10" fill="#64748b">
                  {formatDate(row.date)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function AiBriefing({ forecast }) {
  const insights = forecast.ai_insights || {};
  const watchlist = insights.watchlist || [];
  if (!insights.headline) return null;

  return (
    <Card title="AI operational briefing" icon={BrainCircuit}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-lg font-semibold text-slate-950">{insights.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{insights.summary}</p>
        </div>
        <span className="rounded-full bg-cyan-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-cyan-800">
          {(insights.confidence || 'limited').replaceAll('_', ' ')} confidence
        </span>
      </div>
      {insights.model_name ? (
        <p className="mt-2 text-xs text-slate-500">Selected model: {insights.model_name}</p>
      ) : null}
      {insights.bullets?.length ? (
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          {insights.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
        </ul>
      ) : null}
      {insights.actions?.length ? (
        <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-800">AI recommended actions</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-cyan-950">
            {insights.actions.map((action) => <li key={action}>{action}</li>)}
          </ul>
        </div>
      ) : null}
      {watchlist.length ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {watchlist.map((item) => (
            <Metric key={item.label} label={item.label} value={item.value} />
          ))}
        </dl>
      ) : null}
    </Card>
  );
}

function InsufficientData({ forecast }) {
  const coverage = forecast.coverage || {};
  const historical = forecast.historical_estimates || {};
  const hourlyRows = (historical.hourly_average || []).map((row) => ({
    label: formatHour(row.hour),
    value: row.average,
  }));
  const remainingDays = Math.max(0, Number(coverage.minimum_calendar_days || 30) - Number(coverage.calendar_days || 0));

  return (
    <div className="space-y-5">
      <AiBriefing forecast={forecast} />
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <h3 className="font-semibold text-amber-950">Insufficient historical data for reliable forecasting</h3>
            <p className="mt-1 text-sm leading-relaxed text-amber-900">
              CareLink currently has {coverage.record_count || 0} completed-day demand records across {coverage.calendar_days || 0} calendar days.
              Continue collecting real registrations for at least {remainingDays} more day{remainingDays === 1 ? '' : 's'}.
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-800">Historical estimate — not an AI prediction</p>
          </div>
        </div>
      </div>

      <AnomalyBanner forecast={forecast} />
      <MotionStagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" stagger={0.06}>
        <MotionItem variant={popUp}>
          <ForecastStat label="Calendar coverage" value={coverage.calendar_days || 0} detail={`Minimum ${coverage.minimum_calendar_days || 30} completed days`} icon={BarChart3} />
        </MotionItem>
        <MotionItem variant={popUp}>
          <ForecastStat label="Historical arrivals" value={coverage.record_count || 0} detail={`${coverage.active_days || 0} days recorded activity`} icon={Users} />
        </MotionItem>
        <MotionItem variant={popUp}>
          <ForecastStat label="Daily historical average" value={historical.average_daily_patients || 0} detail="Includes zero-arrival calendar days" icon={Activity} />
        </MotionItem>
        <MotionItem variant={popUp}>
          <ForecastStat label="Active-day average" value={historical.average_on_active_days || 0} detail="Descriptive history, not a forecast" icon={TrendingUp} />
        </MotionItem>
      </MotionStagger>

      <Card title="Historical hourly pattern" icon={Clock3}>
        {hourlyRows.length ? <BarRows rows={hourlyRows} /> : <p className="text-sm text-slate-500">No hourly pattern is available yet.</p>}
      </Card>
    </div>
  );
}

function AnomalyBanner({ forecast }) {
  const anomaly = forecast.anomaly || {};
  if (!anomaly.status || anomaly.status === 'unavailable') return null;
  const tone = anomaly.status === 'anomalous'
    ? 'border-rose-200 bg-rose-50 text-rose-950'
    : anomaly.status === 'elevated'
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : 'border-slate-200 bg-slate-50 text-slate-800';
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${tone}`}>
      Today recorded {forecast.today_actual ?? 0} arrivals
      {anomaly.same_weekday_average != null ? ` versus a same-weekday average of ${anomaly.same_weekday_average}` : ''}.
      Volume status: {String(anomaly.status).toUpperCase()}. This is a historical comparison, not a clinical explanation.
    </div>
  );
}

function AvailableForecast({ forecast }) {
  const tomorrow = forecast.forecasts?.[0];
  const severityRows = Object.entries(tomorrow?.severity || {}).map(([label, value]) => ({ label, value }));
  const vulnerabilityRows = Object.entries(tomorrow?.vulnerability || {}).map(([label, value]) => ({
    label: label.replaceAll('_', ' '),
    value,
  }));
  const hourlyRows = (tomorrow?.hourly || []).map((row) => ({
    label: formatHour(row.hour),
    value: row.expected,
  }));
  const accuracy = forecast.accuracy || {};
  const priorityMentions = vulnerabilityRows.reduce((sum, row) => sum + Number(row.value || 0), 0);

  const centerRows = (forecast.referring_centers || []).map((row) => ({
    label: row.label,
    value: row.count,
  }));

  return (
    <div className="space-y-5">
      <AiBriefing forecast={forecast} />
      <AnomalyBanner forecast={forecast} />
      <MotionStagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" stagger={0.06}>
        <MotionItem variant={popUp}>
          <ForecastStat
            label="Today actual"
            value={forecast.today_actual ?? 0}
            detail="Completed registrations so far today"
            icon={Activity}
          />
        </MotionItem>
        <MotionItem variant={popUp}>
          <ForecastStat
            label="Tomorrow's patients"
            value={tomorrow?.expected ?? '—'}
            detail={tomorrow ? `Expected range ${tomorrow.lower}–${tomorrow.upper}` : 'Unavailable'}
            icon={Users}
          />
        </MotionItem>
        <MotionItem variant={popUp}>
          <ForecastStat
            label="Peak period"
            value={tomorrow?.peakStartHour == null ? 'Unavailable' : `${formatHour(tomorrow.peakStartHour)}–${formatHour(tomorrow.peakEndHour)}`}
            detail={tomorrow?.peakExpectedArrivals == null ? 'Insufficient hourly history' : `${tomorrow.peakExpectedArrivals} expected arrivals`}
            icon={Clock3}
          />
        </MotionItem>
        <MotionItem variant={popUp}>
          <ForecastStat
            label="High / critical severity"
            value={(tomorrow?.severity?.high || 0) + (tomorrow?.severity?.critical || 0)}
            detail="Aggregate historical-pattern estimate"
            icon={ShieldAlert}
          />
        </MotionItem>
        <MotionItem variant={popUp}>
          <ForecastStat
            label="Queue load"
            value={loadLabel(tomorrow?.queueLoad)}
            detail={tomorrow?.expectedPeakQueue == null ? 'Peak backlog unavailable: insufficient service-capacity history' : `Expected peak backlog ${tomorrow.expectedPeakQueue}`}
            icon={Activity}
          />
        </MotionItem>
        <MotionItem variant={popUp}>
          <ForecastStat
            label="Low-demand hours"
            value={tomorrow?.lowDemandStartHour == null ? 'Unavailable' : `${formatHour(tomorrow.lowDemandStartHour)}–${formatHour(tomorrow.lowDemandEndHour)}`}
            detail="Historical arrival pattern, not a staffing instruction"
            icon={Clock3}
          />
        </MotionItem>
        <MotionItem variant={popUp}>
          <ForecastStat
            label="Priority-group mentions"
            value={priorityMentions}
            detail="Overlapping groups; not unique future patients"
            icon={Users}
          />
        </MotionItem>
      </MotionStagger>

      <Card title="Actual patients and future demand forecast" icon={TrendingUp}>
        <ForecastTrendChart actual={forecast.historical_actuals} forecasts={forecast.forecasts} />
      </Card>

      <Card title="Next 7 days" icon={BarChart3}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(forecast.forecasts || []).map((row) => (
            <div key={row.date} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{formatDate(row.date, { weekday: 'short' })}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{row.expected}</p>
              <p className="text-xs text-slate-500">Range {row.lower}–{row.upper}</p>
              <span className="mt-3 inline-flex rounded-full bg-white px-2 py-1 text-[10px] font-bold tracking-wide text-cyan-800">
                {loadLabel(row.queueLoad)} LOAD
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Tomorrow by hour" icon={Clock3}>
          {hourlyRows.length ? <BarRows rows={hourlyRows} /> : <p className="text-sm text-slate-500">No hourly forecast available.</p>}
        </Card>
        <Card title="Tomorrow severity distribution" icon={ShieldAlert}>
          <BarRows rows={severityRows} />
          <p className="mt-4 text-xs leading-relaxed text-slate-500">Population-level demand estimate only. This does not predict any individual patient's condition.</p>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Expected priority-group demand" icon={Users}>
          <BarRows rows={vulnerabilityRows} />
          <p className="mt-4 text-xs leading-relaxed text-slate-500">Groups can overlap; one person may be represented in more than one category.</p>
        </Card>
        <Card title="Highest referring barangays" icon={Users}>
          {centerRows.length ? <BarRows rows={centerRows} /> : <p className="text-sm text-slate-500">No referring-center history is available yet.</p>}
          <p className="mt-4 text-xs leading-relaxed text-slate-500">Historical sender volume used by the AI model. This does not invent future patients.</p>
        </Card>
      </div>

      <Card title="Model validation" icon={BrainCircuit}>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Selected model" value={forecast.model?.name?.replaceAll('_', ' ') || '—'} />
          <Metric label="Confidence" value={forecast.model?.confidence_status?.replaceAll('_', ' ') || 'Limited'} />
          <Metric label="Baseline MAE" value={forecast.model?.validation?.baseline?.mae ?? '—'} />
          <Metric label="Advanced MAE" value={forecast.model?.validation?.advanced?.mae ?? '—'} />
        </dl>
        {tomorrow?.explanationFactors?.length ? (
          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
            {tomorrow.explanationFactors.map((factor) => <li key={factor}>{factor}</li>)}
          </ul>
        ) : null}
      </Card>

      <Card title="Forecast performance" icon={Activity}>
        {accuracy.available ? (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Forecast pairs" value={accuracy.samples} />
            <Metric label="MAE" value={accuracy.mae} />
            <Metric label="RMSE" value={accuracy.rmse} />
            <Metric label="MAPE" value={accuracy.mape == null ? '—' : `${accuracy.mape}%`} />
          </dl>
        ) : (
          <p className="text-sm text-slate-600">
            Accuracy metrics will appear after at least 7 stored forecasts can be compared with completed-day actual counts.
          </p>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-lg font-bold capitalize tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}

export function PatientForecastPanel() {
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api('/ai/forecast')
      .then((data) => {
        if (active) setForecast(data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Unable to load the patient-demand forecast.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function refreshForecast() {
    setLoading(true);
    setError('');
    try {
      const data = await api('/ai/forecast/refresh', { method: 'POST' });
      setForecast(data);
    } catch (requestError) {
      setError(requestError.message || 'Unable to refresh the patient-demand forecast.');
    } finally {
      setLoading(false);
    }
  }

  const generatedLabel = forecast?.generated_at
    ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(forecast.generated_at))
    : null;

  return (
    <div className="space-y-5">
      <Card title="Predictive Queue Volume Forecasting" icon={BrainCircuit}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm leading-relaxed text-slate-600">
              CareLink AI compares a historical-mean baseline with a weekday-trend model, then writes an operational briefing from the winning forecast. No future patient identities are generated.
            </p>
            {generatedLabel ? <p className="mt-1 text-xs text-slate-400">Generated {generatedLabel}</p> : null}
          </div>
          <PrimaryButton type="button" disabled={loading} onClick={refreshForecast}>
            <span className="inline-flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Analyzing…' : 'Refresh forecast'}
            </span>
          </PrimaryButton>
        </div>
        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}
        {!forecast && loading ? <p className="mt-4 text-sm text-slate-500">Loading historical demand data…</p> : null}
      </Card>

      {forecast ? (
        <MotionReveal variant={fadeUp}>
          {forecast.status === 'forecast_available'
            ? <AvailableForecast forecast={forecast} />
            : <InsufficientData forecast={forecast} />}
        </MotionReveal>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs leading-relaxed text-slate-600">{forecast?.disclaimer || DISCLAIMER}</p>
      </div>
    </div>
  );
}

