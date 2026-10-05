import { createElement, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Clock3,
  Download,
  MapPin,
  MessageSquare,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api, downloadCsv } from '../api';
import { classNames } from '../components/helpers';
import { PatientForecastPanel } from '../components/forecast/PatientForecastPanel';
import {
  AnimatedGrid,
  AnimatedGridItem,
  Card,
  CountUp,
  MotionItem,
  MotionReveal,
  MotionStagger,
  PageBlock,
  PageStack,
  PrimaryButton,
  TabPanel,
  easeOut,
  fadeUp,
  popUp,
} from '../components/ui';

const MotionDiv = motion.div;

const CHART_COLORS = [
  '#0e7490',
  '#0891b2',
  '#06b6d4',
  '#22d3ee',
  '#67e8f9',
  '#155e75',
  '#0f766e',
  '#14b8a6',
  '#f59e0b',
  '#f97316',
];

const categories = [
  {
    id: 'reports',
    label: 'Clinic Reports',
    description: 'Status mix, wait times, peak hours, SMS, and staff charts.',
    icon: BarChart3,
  },
  {
    id: 'ai',
    label: 'AI Intelligence',
    description: 'Barangay hotspots, overloaded places, and most case types.',
    icon: BrainCircuit,
  },
  {
    id: 'forecast',
    label: 'AI Patient Forecast',
    description: 'Future patient volume, peak hours, severity mix, and queue demand.',
    icon: TrendingUp,
  },
];

const exports = [
  ['/analytics/export/referrals.csv', 'Referrals CSV'],
  ['/analytics/export/patients.csv', 'Patients CSV'],
  ['/analytics/export/queue.csv', 'Queue CSV'],
  ['/analytics/export/sms.csv', 'SMS CSV'],
];

export default function Analytics({ analytics }) {
  const [activeCategory, setActiveCategory] = useState('reports');

  return (
    <PageStack>
      <PageBlock>
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60 sm:rounded-3xl">
          <div className="mb-4 px-1">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Analytics</h2>
            <p className="text-sm text-slate-500">Live charts and reports from the CareLink database.</p>
          </div>
          <AnimatedGrid className="grid gap-3 sm:grid-cols-3">
            {categories.map((category) => {
              const Icon = category.icon;
              const isActive = activeCategory === category.id;

              return (
                <AnimatedGridItem key={category.id}>
                  <button
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    className={classNames(
                      'group w-full rounded-2xl border p-4 text-left transition',
                      isActive
                        ? 'border-cyan-200 bg-cyan-50 shadow-sm shadow-cyan-900/10'
                        : 'border-slate-200 bg-white hover:border-cyan-200 hover:bg-slate-50',
                    )}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div
                        className={classNames(
                          'rounded-xl p-2 transition',
                          isActive
                            ? 'bg-cyan-700 text-white'
                            : 'bg-slate-100 text-slate-600 group-hover:bg-cyan-50 group-hover:text-cyan-700',
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      {isActive ? (
                        <span className="rounded-full bg-cyan-700 px-2 py-0.5 text-xs font-semibold text-white">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <p className="font-semibold text-slate-950">{category.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{category.description}</p>
                  </button>
                </AnimatedGridItem>
              );
            })}
          </AnimatedGrid>
        </section>
      </PageBlock>

      <PageBlock>
        <TabPanel panelKey={activeCategory}>
          {activeCategory === 'reports' ? <ClinicReportsPanel analytics={analytics} /> : null}
          {activeCategory === 'ai' ? <AiIntelligencePanel /> : null}
          {activeCategory === 'forecast' ? <PatientForecastPanel /> : null}
        </TabPanel>
      </PageBlock>
    </PageStack>
  );
}

function ClinicReportsPanel({ analytics }) {
  const statusRows = normalizeRows(analytics.referralsByStatus, 'status', 'count');
  const priorityRows = normalizeRows(analytics.queueByPriority, 'priority_level', 'count');
  const smsRows = normalizeRows(analytics.smsDelivery, 'status', 'count');
  const centerRows = normalizeRows(analytics.referralsByCenter, 'name', 'count').slice(0, 8);
  const waitRows = normalizeRows(analytics.averageWaitTime, 'priority_level', 'average_wait_minutes');
  const peakRows = [...(analytics.peakHours || [])]
    .sort((a, b) => String(a.hour).localeCompare(String(b.hour)))
    .map((row) => ({
      label: String(row.hour),
      count: Number(row.count || 0),
    }));
  const staffRows = normalizeRows(analytics.staffPerformance, 'staff_name', 'reviewed').slice(0, 8);
  const abandonment = Number(analytics.queueAbandonmentRate?.[0]?.rate_percent || 0);
  const forecast = analytics.volumeForecast?.[0] || {};
  const completion = analytics.completion || {};
  const totalReferrals = Number(completion.total || statusRows.reduce((sum, row) => sum + row.count, 0));
  const completed = Number(completion.completed || 0);
  const missed = Number(completion.missed || 0);
  const completionRate = totalReferrals ? Math.round((completed / totalReferrals) * 100) : 0;

  return (
    <div className="space-y-5">
      <Card title="Exports" icon={Download}>
        <AnimatedGrid className="flex flex-wrap gap-2">
          {exports.map(([href, label]) => (
            <AnimatedGridItem key={href}>
              <button
                type="button"
                onClick={() => downloadCsv(href)}
                className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100"
              >
                {label}
              </button>
            </AnimatedGridItem>
          ))}
        </AnimatedGrid>
      </Card>

      <MotionStagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" stagger={0.07}>
        <MotionItem variant={popUp}>
          <StatTile label="Total referrals" value={totalReferrals} detail="All database records" icon={Activity} />
        </MotionItem>
        <MotionItem variant={popUp}>
          <StatTile label="Completion rate" value={completionRate} detail={`${completed} completed`} suffix="%" icon={Sparkles} />
        </MotionItem>
        <MotionItem variant={popUp}>
          <StatTile label="Missed visits" value={missed} detail="Needs follow-up" icon={AlertTriangle} />
        </MotionItem>
        <MotionItem variant={popUp}>
          <StatTile
            label="7-day forecast"
            value={Number(forecast.estimated_referrals || 0)}
            detail={`Avg ${forecast.daily_average || 0}/day`}
            icon={BarChart3}
          />
        </MotionItem>
      </MotionStagger>

      <MotionReveal variant={fadeUp}>
        <MotionStagger className="grid gap-5 xl:grid-cols-3" stagger={0.1}>
          <MotionItem variant={popUp}>
            <PieChartCard title="Referrals by status" rows={statusRows} icon={Activity} />
          </MotionItem>
          <MotionItem variant={popUp}>
            <PieChartCard title="Queue priority mix" rows={priorityRows} icon={Users} />
          </MotionItem>
          <MotionItem variant={popUp}>
            <PieChartCard title="SMS delivery" rows={smsRows} icon={MessageSquare} />
          </MotionItem>
        </MotionStagger>
      </MotionReveal>

      <MotionReveal variant={fadeUp} delay={0.05}>
        <MotionStagger className="grid gap-5 xl:grid-cols-2" stagger={0.1}>
          <MotionItem variant={popUp}>
            <VerticalBarCard title="Peak referral hours" rows={peakRows} icon={Clock3} />
          </MotionItem>
          <MotionItem variant={popUp}>
            <VerticalBarCard title="Referrals by health center" rows={centerRows} icon={MapPin} />
          </MotionItem>
        </MotionStagger>
      </MotionReveal>

      <MotionReveal variant={fadeUp} delay={0.08}>
        <MotionStagger className="grid gap-5 xl:grid-cols-2" stagger={0.1}>
          <MotionItem variant={popUp}>
            <RankBarCard
              title="Average wait time"
              rows={waitRows.map((row) => ({
                ...row,
                label: prettyLabel(row.label),
                detail: `${row.count} min average`,
              }))}
              valueKey="count"
              suffix=" min"
              icon={Clock3}
            />
          </MotionItem>
          <MotionItem variant={popUp}>
            <RankBarCard
              title="Staff performance"
              rows={staffRows}
              valueKey="count"
              icon={Users}
            />
          </MotionItem>
        </MotionStagger>
      </MotionReveal>

      <MotionReveal variant={fadeUp} delay={0.1}>
        <AbandonmentCard rate={abandonment} />
      </MotionReveal>

      {(analytics.performance || []).length ? (
        <MotionReveal variant={fadeUp} delay={0.12}>
          <RankBarCard
            title="API performance metrics"
            rows={(analytics.performance || []).slice(0, 8).map((row) => ({
              label: prettyLabel(row.operation),
              count: Number(row.average_ms || 0),
              detail: `max ${row.max_ms} ms · ${row.samples || 0} samples`,
            }))}
            valueKey="count"
            suffix=" ms"
            icon={Activity}
          />
        </MotionReveal>
      ) : null}
    </div>
  );
}

function AiIntelligencePanel() {
  const [aiInsights, setAiInsights] = useState(null);
  const [aiError, setAiError] = useState('');
  const [aiLoading, setAiLoading] = useState(true);

  async function loadAiInsights() {
    setAiLoading(true);
    setAiError('');
    try {
      const data = await api('/ai/insights');
      setAiInsights(data);
    } catch (error) {
      setAiInsights(null);
      setAiError(error.message || 'Unable to load AI insights.');
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    api('/ai/insights')
      .then((data) => {
        if (active) setAiInsights(data);
      })
      .catch((error) => {
        if (!active) return;
        setAiInsights(null);
        setAiError(error.message || 'Unable to load AI insights.');
      })
      .finally(() => {
        if (active) setAiLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const barangayRows = (aiInsights?.hotspots?.by_barangay || []).map((row) => ({
    label: shortPlaceLabel(row.label),
    fullLabel: row.label,
    count: row.count,
    share_percent: row.share_percent,
  }));
  const cityRows = (aiInsights?.hotspots?.by_city || []).map((row) => ({
    label: row.label,
    count: row.count,
    share_percent: row.share_percent,
  }));
  const receivingRows = (aiInsights?.hotspots?.by_receiving_center || []).map((row) => ({
    label: shortPlaceLabel(row.label),
    fullLabel: row.label,
    count: row.count,
    share_percent: row.share_percent,
  }));
  const overloadRows = (aiInsights?.overloaded_places || []).map((row) => ({
    label: shortPlaceLabel(row.place),
    fullLabel: row.place,
    count: row.request_count,
    share_percent: row.share_percent,
    score: Number(row.overload_score || 0),
    detail: `${String(row.place_type || '').replaceAll('_', ' ')} · ${row.overload_score}x average`,
  }));
  const caseTypeRows = (aiInsights?.most_cases?.by_referral_type || []).map((row) => ({
    label: prettyLabel(row.label),
    count: row.count,
    share_percent: row.share_percent,
  }));
  const urgencyRows = (aiInsights?.most_cases?.by_clinical_urgency || []).map((row) => ({
    label: prettyLabel(row.label),
    count: row.count,
    share_percent: row.share_percent,
  }));
  const severityRows = (aiInsights?.most_cases?.by_severity || []).map((row) => ({
    label: prettyLabel(row.label),
    count: row.count,
    share_percent: row.share_percent,
  }));
  const themeRows = (aiInsights?.most_cases?.reason_themes || []).map((row) => ({
    label: row.theme,
    count: row.mentions,
    share_percent: row.share_percent,
  }));

  return (
    <div className="space-y-5">
      <Card title="AI Case Intelligence" icon={BrainCircuit}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-slate-600">
            Hotspots, overloaded places, and most common cases — computed from live Supabase referral rows.
          </p>
          <PrimaryButton type="button" disabled={aiLoading} onClick={loadAiInsights}>
            {aiLoading ? 'Analyzing…' : 'Refresh AI insights'}
          </PrimaryButton>
        </div>

        {aiError ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {aiError}
          </p>
        ) : null}

        {aiInsights ? (
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-700" />
              <p className="text-sm font-semibold text-cyan-950">AI summary</p>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-cyan-800">
                Live database
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-cyan-900">{aiInsights.summary}</p>
            <p className="mt-2 text-xs text-cyan-800">
              {aiInsights.total_cases} referral rows from Supabase
              {aiInsights.scope === 'all_referrals' ? ' · all records' : ''}
            </p>
          </div>
        ) : !aiError && aiLoading ? (
          <p className="text-sm text-slate-500">Running AI analysis…</p>
        ) : null}
      </Card>

      {aiInsights ? (
        <>
          <MotionReveal variant={fadeUp}>
            <MotionStagger className="grid gap-5 xl:grid-cols-3" stagger={0.1}>
              <MotionItem variant={popUp}>
                <PieChartCard title="Most case types" rows={caseTypeRows} icon={Stethoscope} />
              </MotionItem>
              <MotionItem variant={popUp}>
                <PieChartCard title="Urgency mix" rows={urgencyRows} icon={Activity} />
              </MotionItem>
              <MotionItem variant={popUp}>
                <PieChartCard title="Severity mix" rows={severityRows} icon={AlertTriangle} />
              </MotionItem>
            </MotionStagger>
          </MotionReveal>

          <MotionReveal variant={fadeUp} delay={0.05}>
            <MotionStagger className="grid gap-5 xl:grid-cols-2" stagger={0.1}>
              <MotionItem variant={popUp}>
                <VerticalBarCard title="Barangays with most cases" rows={barangayRows.slice(0, 8)} icon={MapPin} />
              </MotionItem>
              <MotionItem variant={popUp}>
                <VerticalBarCard title="Receiving center volume" rows={receivingRows.slice(0, 8)} icon={Activity} />
              </MotionItem>
            </MotionStagger>
          </MotionReveal>

          <MotionReveal variant={fadeUp} delay={0.08}>
            <MotionStagger className="grid gap-5 xl:grid-cols-3" stagger={0.1}>
              <MotionItem variant={popUp}>
                <RankBoard title="Barangay ranking" rows={barangayRows.slice(0, 8)} icon={MapPin} />
              </MotionItem>
              <MotionItem variant={popUp}>
                <RankBarCard title="Cities with most cases" rows={cityRows.slice(0, 8)} icon={MapPin} />
              </MotionItem>
              <MotionItem variant={popUp}>
                <OverloadBoard rows={overloadRows.slice(0, 6)} />
              </MotionItem>
            </MotionStagger>
          </MotionReveal>

          <MotionReveal variant={fadeUp} delay={0.1}>
            <RankBarCard title="Reason themes" rows={themeRows.slice(0, 8)} icon={Sparkles} />
          </MotionReveal>

          {aiInsights.recommendations?.length ? (
            <Card title="AI Recommendations" icon={Sparkles}>
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
                {aiInsights.recommendations.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function normalizeRows(rows = [], labelKey, valueKey) {
  return rows.map((row) => ({
    label: prettyLabel(row[labelKey]),
    count: Number(row[valueKey] || 0),
    share_percent: row.share_percent,
  }));
}

function prettyLabel(value) {
  return String(value || 'unknown').replaceAll('_', ' ');
}

function shortPlaceLabel(value) {
  return String(value || '')
    .replace(/^Barangay\s+/i, 'Brgy. ')
    .replace(/\s+Health Center$/i, '')
    .replace(/\s+City Health Center$/i, '')
    .trim() || 'Unknown';
}

function StatTile({ label, value, detail, icon, suffix = '' }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm shadow-slate-200/50">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
          {createElement(icon, { className: 'h-4 w-4' })}
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-950">
        <CountUp to={Number(value || 0)} duration={1.2} />
        {suffix}
      </p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function PieChartCard({ title, rows, icon: Icon = Activity }) {
  const slices = buildPieSlices(rows.slice(0, 6));
  const total = slices.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card title={title} icon={Icon}>
      {slices.length ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative grid h-40 w-40 shrink-0 place-items-center">
            <svg viewBox="0 0 120 120" className="h-40 w-40 -rotate-90">
              {slices.map((slice) => (
                <circle
                  key={`${title}-${slice.label}-arc`}
                  cx="60"
                  cy="60"
                  r="42"
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth="20"
                  strokeDasharray={`${slice.dash} ${slice.gap}`}
                  strokeDashoffset={slice.offset}
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-xl font-bold tabular-nums text-slate-950">
                  <CountUp to={total} duration={1.1} />
                </p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Total</p>
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            {slices.map((slice, index) => (
              <MotionDiv
                key={`${title}-${slice.label}`}
                initial={{ opacity: 0, x: 8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: index * 0.04, ease: easeOut }}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2 text-slate-600">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                  <span className="truncate capitalize">{slice.label}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                  {slice.count}
                  {slice.share_percent != null ? ` · ${slice.share_percent}%` : total ? ` · ${Math.round((slice.count / total) * 1000) / 10}%` : ''}
                </span>
              </MotionDiv>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No chart data yet.</p>
      )}
    </Card>
  );
}

function buildPieSlices(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0) || 1;
  const circumference = 2 * Math.PI * 42;
  let cursor = 0;

  return rows.map((row, index) => {
    const count = Number(row.count || 0);
    const dash = (count / total) * circumference;
    const slice = {
      ...row,
      count,
      color: CHART_COLORS[index % CHART_COLORS.length],
      dash,
      gap: circumference - dash,
      offset: -cursor,
    };
    cursor += dash;
    return slice;
  });
}

function VerticalBarCard({ title, rows, icon: Icon = BarChart3 }) {
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);

  return (
    <Card title={title} icon={Icon}>
      <div className="flex h-72 items-end gap-2 rounded-2xl bg-slate-50 p-4">
        {rows.length ? rows.map((row, index) => {
          const value = Number(row.count || 0);
          const height = Math.max(10, (value / max) * 200);

          return (
            <MotionDiv
              key={`${title}-${row.label}-${index}`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: index * 0.03, ease: easeOut }}
              className="group flex min-w-0 flex-1 flex-col items-center justify-end"
              title={`${row.fullLabel || row.label}: ${value}`}
            >
              <span className="mb-1 text-[10px] font-semibold text-slate-500 opacity-0 transition group-hover:opacity-100">
                {value}
              </span>
              <div
                className="w-full rounded-t-xl"
                style={{
                  height,
                  background: `linear-gradient(180deg, ${CHART_COLORS[index % CHART_COLORS.length]} 0%, #155e75 100%)`,
                }}
              />
              <span className="mt-2 w-full truncate text-center text-[10px] capitalize text-slate-500">
                {row.label}
              </span>
            </MotionDiv>
          );
        }) : (
          <p className="m-auto text-sm text-slate-500">No chart data yet.</p>
        )}
      </div>
    </Card>
  );
}

function RankBarCard({ title, rows, valueKey = 'count', suffix = '', icon: Icon = Activity }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);

  return (
    <Card title={title} icon={Icon}>
      <div className="space-y-3">
        {rows.length ? rows.map((row, index) => {
          const value = Number(row[valueKey] || 0);
          const width = Math.max(8, (value / max) * 100);

          return (
            <MotionDiv
              key={`${title}-${row.label}-${index}`}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: index * 0.04, ease: easeOut }}
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate capitalize text-slate-600" title={row.fullLabel || row.label}>
                  {row.label}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                  {value}{suffix}
                  {row.share_percent != null ? ` · ${row.share_percent}%` : ''}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${width}%`,
                    background: `linear-gradient(90deg, ${CHART_COLORS[index % CHART_COLORS.length]}, #155e75)`,
                  }}
                />
              </div>
              {row.detail ? <p className="mt-1 text-[11px] text-slate-400">{row.detail}</p> : null}
            </MotionDiv>
          );
        }) : (
          <p className="text-sm text-slate-500">No chart data yet.</p>
        )}
      </div>
    </Card>
  );
}

function RankBoard({ title, rows, icon: Icon }) {
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);

  return (
    <Card title={title} icon={Icon}>
      <div className="space-y-3">
        {rows.map((row, index) => {
          const value = Number(row.count || 0);
          const width = Math.max(6, (value / max) * 100);

          return (
            <div key={`${title}-${row.label}-${index}`} className="rounded-2xl bg-slate-50/90 p-3">
              <div className="mb-2 flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold tabular-nums text-cyan-800 shadow-sm">
                  {index + 1}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800" title={row.fullLabel || row.label}>
                  {row.label}
                </p>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-slate-950">{value}</p>
                  {row.share_percent != null ? (
                    <p className="text-[11px] tabular-nums text-slate-500">{row.share_percent}%</p>
                  ) : null}
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${width}%`,
                    background: `linear-gradient(90deg, ${CHART_COLORS[index % CHART_COLORS.length]}, #155e75)`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function OverloadBoard({ rows }) {
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);

  return (
    <Card title="Overloaded places" icon={AlertTriangle}>
      {rows.length ? (
        <div className="space-y-3">
          {rows.map((row, index) => {
            const value = Number(row.count || 0);
            const width = Math.max(8, (value / max) * 100);
            const isTop = index === 0;

            return (
              <div
                key={`overload-${row.label}-${index}`}
                className={classNames(
                  'rounded-2xl p-3',
                  isTop ? 'border border-amber-200 bg-amber-50' : 'bg-slate-50',
                )}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {isTop ? (
                      <span className="mb-1 inline-block rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Peak load
                      </span>
                    ) : null}
                    <p className="truncate text-sm font-semibold text-slate-900" title={row.fullLabel || row.label}>
                      {row.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{row.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold tabular-nums text-amber-800">{row.score}x</p>
                    <p className="text-[11px] tabular-nums text-slate-500">{value} · {row.share_percent}%</p>
                  </div>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/80">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 px-4 py-8 text-center">
          <p className="text-sm font-medium text-emerald-800">No overloaded places detected</p>
          <p className="mt-1 text-xs text-emerald-700/80">Referral volume is balanced across centers.</p>
        </div>
      )}
    </Card>
  );
}

function AbandonmentCard({ rate }) {
  const clamped = Math.max(0, Math.min(100, Number(rate || 0)));

  return (
    <Card title="Queue abandonment" icon={AlertTriangle}>
      <div className="rounded-2xl bg-slate-50 p-5">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Abandonment rate</p>
            <p className="mt-1 text-4xl font-bold tabular-nums text-slate-950">
              <CountUp to={clamped} duration={1.2} />
              <span className="text-2xl">%</span>
            </p>
          </div>
          <p className="max-w-[12rem] text-right text-xs text-slate-500">
            Missed, cancelled, and expired queue entries vs all assigned.
          </p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500"
            style={{ width: `${Math.max(4, clamped)}%` }}
          />
        </div>
      </div>
    </Card>
  );
}
