import { MapPin, ShieldAlert } from 'lucide-react';
import { Card } from '../ui';

export function PhilippineDatasetsPanel({ context }) {
  if (!context?.show) return null;

  const rates = context.population_adjusted_barangays || [];
  const seasonal = (context.seasonal_watch || []).filter((risk) => risk.seen_locally);
  const notifiable = context.notifiable_matches || [];
  const aligned = context.national_morbidity_alignment || [];
  const maxRate = rates.reduce((max, row) => Math.max(max, Number(row.cases_per_1000 || 0)), 0) || 1;

  return (
    <Card title="Compared with current referrals" icon={MapPin}>
      {context.as_of_label ? (
        <p className="text-xs font-medium text-cyan-800">As of {context.as_of_label}</p>
      ) : null}
      {context.summary ? (
        <p className={`max-w-3xl text-sm leading-relaxed text-slate-600 ${context.as_of_label ? 'mt-2' : ''}`}>{context.summary}</p>
      ) : null}

      {rates.length ? (
        <ul className={`space-y-3 ${context.summary ? 'mt-4' : ''}`}>
          {rates.slice(0, 3).map((row) => (
            <li key={`${row.psa_name}-${row.label}`}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-slate-900">{row.psa_name}</span>
                <span className="shrink-0 tabular-nums text-slate-700">{row.cases_per_1000} / 1,000</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-cyan-600"
                  style={{ width: `${Math.max(8, (Number(row.cases_per_1000) / maxRate) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {row.cases} current referrals · {Number(row.population).toLocaleString('en-PH')} residents
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {seasonal.length ? (
        <ul className="mt-4 space-y-2">
          {seasonal.map((risk) => (
            <li key={risk.condition} className="text-sm text-slate-700">
              <span className="font-medium text-slate-950">{risk.condition}</span>
              {risk.level === 'elevated' ? ' is in its national peak month and is in the current referrals. ' : ' is in the current referrals. '}
              {risk.guidance}
            </li>
          ))}
        </ul>
      ) : null}

      {aligned.length > 1 ? (
        <p className="mt-3 text-xs text-slate-500">
          Also matched on {context.as_of_label || 'the current date'}: {aligned.slice(1, 3).map((row) => row.condition).join(', ')}.
        </p>
      ) : null}

      {notifiable.length ? (
        <div className="mt-4 flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            PIDSR check on current referrals: {notifiable.map((item) => `${item.name} (${item.category})`).join(', ')}.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
