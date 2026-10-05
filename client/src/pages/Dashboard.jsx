import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Bell,
  BrainCircuit,
  ClipboardList,
  LayoutDashboard,
  MapPin,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api } from '../api';
import { classNames } from '../components/helpers';
import { PhilippineDatasetsPanel } from '../components/ai/PhilippineDatasetsPanel';
import { PatientForecastPanel } from '../components/forecast/PatientForecastPanel';
import {
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

const categories = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Clinic volume, queue mix, and performance efficiency.',
    icon: LayoutDashboard,
  },
  {
    id: 'ai',
    label: 'AI Analytics',
    description: 'Most cases, barangay hotspots, and overloaded places.',
    icon: BrainCircuit,
  },
  {
    id: 'forecast',
    label: 'Advanced AI Patient Forecasting',
    description: 'Advanced AI patient-demand forecasting from historical registrations.',
    icon: TrendingUp,
  },
];

export default function Dashboard({ summary, canUseAi = true }) {
  const [activeCategory, setActiveCategory] = useState('overview');
  const visibleCategories = categories.filter((category) => category.id === 'overview' || canUseAi);
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <PageStack>
      <PageBlock>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">Koronadal City referral operations</p>
            <p className="mt-1 text-sm font-medium text-slate-700">{todayLabel}</p>
          </div>
          {visibleCategories.length > 1 ? (
            <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1">
              {visibleCategories.map((category) => {
                const Icon = category.icon;
                const isActive = activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    title={category.description}
                    onClick={() => setActiveCategory(category.id)}
                    className={classNames(
                      'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition',
                      isActive ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {category.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </PageBlock>

      <PageBlock>
        <TabPanel panelKey={canUseAi ? activeCategory : 'overview'}>
          {!canUseAi || activeCategory === 'overview' ? (
            <OverviewPanel summary={summary} />
          ) : activeCategory === 'forecast' ? (
            <PatientForecastPanel />
          ) : (
            <AiAnalyticsPanel />
          )}
        </TabPanel>
      </PageBlock>
    </PageStack>
  );
}

function OverviewPanel({ summary }) {
  const referralTotal = summary.referralCounts?.reduce((sum, row) => sum + Number(row.count), 0) || 0;
  const queueTotal = summary.queueCounts?.reduce((sum, row) => sum + Number(row.count), 0) || 0;
  const smsTotal = summary.smsCounts?.reduce((sum, row) => sum + Number(row.count), 0) || 0;
  const operational = summary.operationalCounts || {};
  const waitingRate = queueTotal ? Math.round((Number(operational.waiting_queue || 0) / queueTotal) * 100) : 0;
  const demographicLabels = {
    seniors: 'Senior',
    pregnant: 'Pregnant',
    pwd: 'PWD',
    child: 'Child',
    infant: 'Infant',
    indigenous: 'Indigenous (IP)',
    soloParent: 'Solo parent',
    standard: 'Standard',
  };
  const demographicRows = Object.entries(summary.demographicDistribution || {}).map(([key, value]) => ({
    label: demographicLabels[key] || key,
    count: Number(value || 0),
  }));
  const queueByPriority = (summary.queueCounts || []).reduce((acc, row) => {
    acc[row.priority_level] = (acc[row.priority_level] || 0) + Number(row.count);
    return acc;
  }, {});
  const smsByTrigger = (summary.smsCounts || []).reduce((acc, row) => {
    acc[row.trigger_type] = (acc[row.trigger_type] || 0) + Number(row.count);
    return acc;
  }, {});

  const headline = [
    { label: 'Patients', value: summary.patientCount || 0, detail: 'Registered records', icon: Users },
    { label: 'Referrals', value: referralTotal, detail: 'Total submissions', icon: ClipboardList },
    { label: 'In queue', value: queueTotal, detail: 'Prioritized patients', icon: Bell },
    { label: 'Completion', value: operational.completion_rate || 0, detail: 'Share of all referrals', icon: Activity, suffix: '%' },
  ];
  const operations = [
    ['Pending review', operational.pending_review || 0, 'Awaiting city staff'],
    ['Submitted today', operational.submitted_today || 0, 'New referrals'],
    ['Missed today', operational.missed_today || 0, 'Needs follow-up'],
    ['Waiting', operational.waiting_queue || 0, `${waitingRate}% of the queue`],
    ['SMS sent', smsTotal, 'Notification attempts'],
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {headline.map((item, index) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-slate-500">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 tabular-nums">
                <CountUp to={Number(item.value)} delay={index * 0.05} duration={1.1} />
                {item.suffix || ''}
              </p>
              <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
            </article>
          );
        })}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {operations.map(([label, value, detail]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">
              <CountUp to={Number(value)} duration={1} />
            </p>
            <p className="mt-0.5 text-xs text-slate-400">{detail}</p>
          </div>
        ))}
      </section>

      <MotionReveal variant={fadeUp}>
        <MotionStagger className="grid gap-5 xl:grid-cols-2" stagger={0.12}>
          <MotionItem variant={popUp}>
            <BarChart title="14-Day Referral Trend" rows={summary.referralTrend || []} labelKey="date" valueKey="count" />
          </MotionItem>
          <MotionItem variant={popUp}>
            <BarChart title="Referrals by Health Center" rows={summary.centerDistribution || []} labelKey="name" valueKey="count" />
          </MotionItem>
        </MotionStagger>
      </MotionReveal>

      <MotionReveal variant={fadeUp} delay={0.05}>
        <MotionStagger className="grid gap-5 xl:grid-cols-3" stagger={0.1}>
          <MotionItem variant={popUp}>
            <DonutSummary title="Referral Status Mix" rows={summary.referralCounts || []} labelKey="status" valueKey="count" />
          </MotionItem>
          <MotionItem variant={popUp}>
            <DonutSummary
              title="Queue Priority Mix"
              rows={Object.entries(queueByPriority).map(([label, count]) => ({ label, count }))}
              labelKey="label"
              valueKey="count"
            />
          </MotionItem>
          <MotionItem variant={popUp}>
            <DonutSummary
              title="SMS Trigger Mix"
              rows={Object.entries(smsByTrigger).map(([label, count]) => ({ label, count }))}
              labelKey="label"
              valueKey="count"
            />
          </MotionItem>
        </MotionStagger>
      </MotionReveal>

      <MotionReveal variant={fadeUp} delay={0.1}>
        <MotionStagger className="grid gap-5 xl:grid-cols-3" stagger={0.1}>
          <MotionItem variant={popUp}>
            <HorizontalBars title="Clinical Urgency Distribution" rows={summary.urgencyDistribution || []} labelKey="clinical_urgency" valueKey="count" />
          </MotionItem>
          <MotionItem variant={popUp}>
            <HorizontalBars title="Patient Demographic Analysis" rows={demographicRows} labelKey="label" valueKey="count" />
          </MotionItem>
          <MotionItem variant={popUp}>
            <MetricList title="Performance Efficiency" rows={summary.performanceMetrics || []} />
          </MotionItem>
        </MotionStagger>
      </MotionReveal>
    </div>
  );
}

const CHART_COLORS = [
  '#0e7490',
  '#0891b2',
  '#06b6d4',
  '#22d3ee',
  '#67e8f9',
  '#155e75',
  '#164e63',
  '#0f766e',
  '#14b8a6',
  '#5eead4',
];

function AiAnalyticsPanel() {
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
    loadAiInsights();
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
    label: String(row.label || '').replaceAll('_', ' '),
    count: row.count,
    share_percent: row.share_percent,
  }));
  const urgencyRows = (aiInsights?.most_cases?.by_clinical_urgency || []).map((row) => ({
    label: String(row.label || '').replaceAll('_', ' '),
    count: row.count,
    share_percent: row.share_percent,
  }));
  const severityRows = (aiInsights?.most_cases?.by_severity || []).map((row) => ({
    label: String(row.label || '').replaceAll('_', ' '),
    count: row.count,
    share_percent: row.share_percent,
  }));
  const themeRows = (aiInsights?.most_cases?.reason_themes || []).map((row) => ({
    label: row.theme,
    count: row.mentions,
    share_percent: row.share_percent,
  }));

  const topBarangay = barangayRows[0];
  const topCase = caseTypeRows[0];
  const topOverload = overloadRows[0];

  return (
    <div className="space-y-5">
      <Card title="AI Analytics" icon={BrainCircuit}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-slate-500">
            Barangay hotspots, center load, and the referral types seen most often.
          </p>
          <PrimaryButton type="button" disabled={aiLoading} onClick={loadAiInsights}>
            {aiLoading ? 'Analyzing…' : 'Refresh'}
          </PrimaryButton>
        </div>

        {aiError ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {aiError}
          </p>
        ) : null}

        {aiInsights ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="h-4 w-4 text-slate-600" />
                <p className="text-sm font-semibold text-slate-950">Summary</p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{aiInsights.summary}</p>
              <p className="mt-2 text-xs text-slate-500">
                {aiInsights.total_cases} referral rows from Supabase
                {aiInsights.scope === 'all_referrals' ? ' · all records' : ` · ${aiInsights.scope?.replaceAll('_', ' ')}`}
              </p>
            </div>

            <MotionStagger className="grid gap-4 md:grid-cols-3" stagger={0.08}>
              <MotionItem variant={popUp}>
                <HighlightStat
                  label="Top barangay cases"
                  value={topBarangay?.fullLabel || topBarangay?.label || '—'}
                  detail={topBarangay ? `${topBarangay.count} cases · ${topBarangay.share_percent}%` : 'No hotspot data'}
                  icon={MapPin}
                />
              </MotionItem>
              <MotionItem variant={popUp}>
                <HighlightStat
                  label="Most common case"
                  value={topCase?.label || '—'}
                  detail={topCase ? `${topCase.count} cases · ${topCase.share_percent}%` : 'No case-type data'}
                  icon={Stethoscope}
                />
              </MotionItem>
              <MotionItem variant={popUp}>
                <HighlightStat
                  label="Highest overload"
                  value={topOverload?.fullLabel || topOverload?.label || 'None'}
                  detail={topOverload ? topOverload.detail : 'No overloaded places detected'}
                  icon={AlertTriangle}
                />
              </MotionItem>
            </MotionStagger>
          </div>
        ) : !aiError && aiLoading ? (
          <p className="text-sm text-slate-500">Running AI analysis on referral cases…</p>
        ) : null}
      </Card>

      {aiInsights ? (
        <>
          <MotionReveal variant={fadeUp}>
            <MotionStagger className="grid gap-5 xl:grid-cols-3" stagger={0.1}>
              <MotionItem variant={popUp}>
                <PieChartCard title="Most case types" rows={caseTypeRows} />
              </MotionItem>
              <MotionItem variant={popUp}>
                <PieChartCard title="Urgency mix" rows={urgencyRows} />
              </MotionItem>
              <MotionItem variant={popUp}>
                <PieChartCard title="Severity mix" rows={severityRows} />
              </MotionItem>
            </MotionStagger>
          </MotionReveal>

          <MotionReveal variant={fadeUp} delay={0.05}>
            <MotionStagger className="grid gap-5 xl:grid-cols-2" stagger={0.12}>
              <MotionItem variant={popUp}>
                <VerticalBarCard
                  title="Barangays with most cases"
                  rows={barangayRows.slice(0, 8)}
                  icon={MapPin}
                />
              </MotionItem>
              <MotionItem variant={popUp}>
                <VerticalBarCard
                  title="Receiving center volume"
                  rows={receivingRows.slice(0, 8)}
                  icon={Activity}
                />
              </MotionItem>
            </MotionStagger>
          </MotionReveal>

          <MotionReveal variant={fadeUp} delay={0.08}>
            <MotionStagger className="grid gap-5 xl:grid-cols-2" stagger={0.1}>
              <MotionItem variant={popUp}>
                <RankBarCard
                  title="Overloaded places"
                  rows={overloadRows.slice(0, 8)}
                  valueKey="count"
                  emptyLabel="No overloaded places detected."
                  icon={AlertTriangle}
                  accent="amber"
                />
              </MotionItem>
              <MotionItem variant={popUp}>
                <RankBarCard
                  title="Cities with most cases"
                  rows={cityRows.slice(0, 8)}
                  valueKey="count"
                  icon={MapPin}
                />
              </MotionItem>
            </MotionStagger>
          </MotionReveal>

          <MotionReveal variant={fadeUp} delay={0.1}>
            <MotionStagger className="grid gap-5 xl:grid-cols-2" stagger={0.1}>
              <MotionItem variant={popUp}>
                <RankBarCard
                  title="Reason themes"
                  rows={themeRows.slice(0, 8)}
                  valueKey="count"
                  icon={Sparkles}
                />
              </MotionItem>
              <MotionItem variant={popUp}>
                <OverloadScoreCard rows={overloadRows.slice(0, 6)} />
              </MotionItem>
            </MotionStagger>
          </MotionReveal>

          <MotionReveal variant={fadeUp} delay={0.12}>
            <MotionStagger className="grid gap-5 xl:grid-cols-3" stagger={0.1}>
              <MotionItem variant={popUp}>
                <RankBoard
                  title="Barangay ranking"
                  icon={MapPin}
                  rows={barangayRows.slice(0, 8).map((row) => ({
                    ...row,
                    label: row.fullLabel || row.label,
                  }))}
                />
              </MotionItem>
              <MotionItem variant={popUp}>
                <CaseTypeBoard title="Most case types" rows={caseTypeRows} />
              </MotionItem>
              <MotionItem variant={popUp}>
                <OverloadBoard
                  title="Places with too many requests"
                  rows={overloadRows.slice(0, 6).map((row) => ({
                    ...row,
                    label: row.fullLabel || row.label,
                  }))}
                />
              </MotionItem>
            </MotionStagger>
          </MotionReveal>

          <PhilippineDatasetsPanel context={aiInsights.philippine_context} />

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

function shortPlaceLabel(value) {
  return String(value || '')
    .replace(/^Barangay\s+/i, 'Brgy. ')
    .replace(/\s+Health Center$/i, '')
    .replace(/\s+City Health Center$/i, '')
    .trim() || 'Unknown';
}

function PieChartCard({ title, rows }) {
  const slices = buildPieSlices(rows.slice(0, 6));
  const total = slices.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card title={title} icon={Activity}>
      {slices.length ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative grid h-44 w-44 shrink-0 place-items-center">
            <svg viewBox="0 0 120 120" className="h-44 w-44 -rotate-90">
              {slices.map((slice) => (
                <circle
                  key={`${title}-${slice.label}-arc`}
                  cx="60"
                  cy="60"
                  r="42"
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth="22"
                  strokeDasharray={`${slice.dash} ${slice.gap}`}
                  strokeDashoffset={slice.offset}
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="text-2xl font-bold tabular-nums text-slate-950">
                  <CountUp to={total} duration={1.2} />
                </p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Total</p>
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            {slices.map((slice, index) => (
              <MotionDiv
                key={`${title}-${slice.label}`}
                initial={{ opacity: 0, x: 10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: index * 0.05, ease: easeOut }}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2 text-slate-600">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                  <span className="truncate capitalize">{slice.label}</span>
                </span>
                <span className="shrink-0 font-semibold text-slate-900">
                  {slice.count}
                  {slice.share_percent != null ? ` · ${slice.share_percent}%` : ''}
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
    const share = count / total;
    const dash = share * circumference;
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

function VerticalBarCard({ title, rows, icon: Icon = LayoutDashboard }) {
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);

  return (
    <Card title={title} icon={Icon}>
      <div className="flex h-72 items-end gap-2 rounded-2xl bg-slate-50 p-4">
        {rows.length ? rows.map((row, index) => {
          const value = Number(row.count || 0);
          const height = Math.max(10, (value / max) * 200);

          return (
            <MotionDiv
              key={`${title}-${row.label}`}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.45, delay: index * 0.04, ease: easeOut }}
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

function RankBarCard({ title, rows, valueKey = 'count', emptyLabel = 'No data yet.', icon: Icon = Activity, accent = 'cyan' }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);
  const barClass = accent === 'amber' ? 'bg-amber-500' : 'bg-cyan-600';

  return (
    <Card title={title} icon={Icon}>
      <div className="space-y-3">
        {rows.length ? rows.map((row, index) => {
          const value = Number(row[valueKey] || 0);
          const width = Math.max(8, (value / max) * 100);

          return (
            <MotionDiv
              key={`${title}-${row.label}-${index}`}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: index * 0.04, ease: easeOut }}
            >
              <div className="mb-1 flex justify-between gap-3 text-xs text-slate-500">
                <span className="truncate capitalize" title={row.fullLabel || row.label}>
                  {row.label}
                </span>
                <span className="shrink-0 font-semibold text-slate-700">
                  {value}
                  {row.share_percent != null ? ` · ${row.share_percent}%` : ''}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <MotionDiv
                  initial={{ width: 0 }}
                  whileInView={{ width: `${width}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.55, delay: index * 0.04, ease: easeOut }}
                  className={`h-full rounded-full ${barClass}`}
                />
              </div>
              {row.detail ? <p className="mt-1 text-[11px] text-slate-400">{row.detail}</p> : null}
            </MotionDiv>
          );
        }) : (
          <p className="text-sm text-slate-500">{emptyLabel}</p>
        )}
      </div>
    </Card>
  );
}

function OverloadScoreCard({ rows }) {
  const max = Math.max(...rows.map((row) => Number(row.score || 0)), 1);

  return (
    <Card title="Overload score comparison" icon={AlertTriangle}>
      <div className="space-y-3">
        {rows.length ? rows.map((row, index) => {
          const score = Number(row.score || 0);
          const width = Math.max(10, (score / max) * 100);

          return (
            <MotionDiv
              key={`overload-score-${row.label}-${index}`}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.05, ease: easeOut }}
              className="rounded-2xl bg-amber-50/70 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-slate-800" title={row.fullLabel || row.label}>
                  {row.label}
                </p>
                <p className="shrink-0 text-sm font-bold tabular-nums text-amber-800">{score}x</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-amber-100">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${width}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-amber-900/70">{row.count} requests · {row.share_percent}% share</p>
            </MotionDiv>
          );
        }) : (
          <p className="text-sm text-slate-500">No overloaded places detected.</p>
        )}
      </div>
    </Card>
  );
}

function HighlightStat({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm shadow-slate-200/40">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="line-clamp-2 text-lg font-bold capitalize leading-snug text-slate-950">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function RankBoard({ title, icon: Icon, rows, emptyLabel = 'No data yet.' }) {
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);

  return (
    <Card title={title} icon={Icon}>
      {rows.length ? (
        <div className="space-y-3">
          {rows.map((row, index) => {
            const value = Number(row.count || 0);
            const width = Math.max(6, (value / max) * 100);
            const share = row.share_percent != null ? `${row.share_percent}%` : null;

            return (
              <MotionDiv
                key={`${title}-${row.label}-${index}`}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: index * 0.04, ease: easeOut }}
                className="rounded-2xl bg-slate-50/90 p-3 transition hover:bg-cyan-50/60"
              >
                <div className="mb-2 flex items-center gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold tabular-nums text-cyan-800 shadow-sm">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800" title={row.label}>
                      {shortPlaceLabel(row.label)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-slate-950">{value}</p>
                    {share ? <p className="text-[11px] tabular-nums text-slate-500">{share}</p> : null}
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
              </MotionDiv>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      )}
    </Card>
  );
}

function CaseTypeBoard({ title, rows }) {
  const slices = buildPieSlices(rows.slice(0, 6));
  const total = slices.reduce((sum, row) => sum + row.count, 0);
  const max = Math.max(...slices.map((row) => row.count), 1);

  return (
    <Card title={title} icon={Stethoscope}>
      {slices.length ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-3">
            <div className="relative grid h-28 w-28 shrink-0 place-items-center">
              <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
                {slices.map((slice) => (
                  <circle
                    key={`${title}-pie-${slice.label}`}
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
                  <p className="text-lg font-bold tabular-nums text-slate-950">{total}</p>
                  <p className="text-[9px] uppercase tracking-wide text-slate-500">Cases</p>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              {slices.map((slice) => (
                <div key={`${title}-legend-${slice.label}`} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2 text-slate-600">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                    <span className="truncate capitalize">{slice.label}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900">{slice.share_percent}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {slices.map((slice, index) => {
              const width = Math.max(8, (slice.count / max) * 100);
              return (
                <div key={`${title}-bar-${slice.label}`}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="capitalize text-slate-600">{slice.label}</span>
                    <span className="font-semibold tabular-nums text-slate-900">{slice.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${width}%`, backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No case-type data yet.</p>
      )}
    </Card>
  );
}

function OverloadBoard({ title, rows }) {
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);

  return (
    <Card title={title} icon={AlertTriangle}>
      {rows.length ? (
        <div className="space-y-3">
          {rows.map((row, index) => {
            const value = Number(row.count || 0);
            const score = Number(row.score || 0);
            const width = Math.max(8, (value / max) * 100);
            const isTop = index === 0;

            return (
              <MotionDiv
                key={`${title}-${row.label}-${index}`}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: index * 0.05, ease: easeOut }}
                className={classNames(
                  'rounded-2xl p-3',
                  isTop ? 'border border-amber-200 bg-amber-50' : 'bg-slate-50',
                )}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      {isTop ? (
                        <span className="rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Peak load
                        </span>
                      ) : (
                        <span className="grid h-6 w-6 place-items-center rounded-md bg-white text-[11px] font-bold text-amber-800">
                          {index + 1}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm font-semibold text-slate-900" title={row.label}>
                      {shortPlaceLabel(row.label)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{row.detail || 'Above average volume'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold tabular-nums text-amber-800">{score ? `${score}x` : value}</p>
                    <p className="text-[11px] tabular-nums text-slate-500">
                      {value} cases
                      {row.share_percent != null ? ` · ${row.share_percent}%` : ''}
                    </p>
                  </div>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/80">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${width}%` }} />
                </div>
              </MotionDiv>
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

function chartTotal(rows, valueKey) {
  return rows.reduce((sum, row) => sum + Number(row[valueKey] || 0), 0);
}

function axisLabel(value) {
  const text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(`${text.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  }
  return text.replaceAll('_', ' ');
}

function BarChart({ title, rows, labelKey, valueKey }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);

  return (
    <Card title={title} icon={LayoutDashboard}>
      <div className="flex h-64 items-end gap-1.5">
        {rows.length ? rows.map((row) => {
          const value = Number(row[valueKey] || 0);
          const height = Math.max(6, (value / max) * 190);

          return (
            <div
              key={`${title}-${row[labelKey]}`}
              className="flex min-w-0 flex-1 flex-col items-center justify-end"
              title={`${axisLabel(row[labelKey])}: ${value}`}
            >
              <span className="mb-1 text-[10px] font-medium tabular-nums text-slate-400">{value || ''}</span>
              <div className="w-full rounded-t-md bg-slate-800" style={{ height }} />
              <span className="mt-2 w-full truncate text-center text-[10px] text-slate-500">
                {axisLabel(row[labelKey])}
              </span>
            </div>
          );
        }) : (
          <p className="m-auto text-sm text-slate-500">No trend data yet.</p>
        )}
      </div>
    </Card>
  );
}

function HorizontalBars({ title, rows, labelKey, valueKey }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);

  return (
    <Card title={title} icon={Activity}>
      <div className="space-y-3">
        {rows.length ? rows.map((row, index) => {
          const value = Number(row[valueKey] || 0);
          const width = Math.max(8, (value / max) * 100);

          return (
            <MotionDiv
              key={`${title}-${row[labelKey]}`}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: index * 0.05, ease: easeOut }}
            >
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span className="capitalize">{String(row[labelKey]).replaceAll('_', ' ')}</span>
                <span className="font-semibold text-slate-700">{value}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-cyan-600" style={{ width: `${width}%` }} />
              </div>
            </MotionDiv>
          );
        }) : (
          <p className="text-sm text-slate-500">No distribution data yet.</p>
        )}
      </div>
    </Card>
  );
}

function DonutSummary({ title, rows, labelKey, valueKey }) {
  const slices = buildPieSlices((Array.isArray(rows) ? rows : []).map((row) => ({
    label: String(row[labelKey] || '').replaceAll('_', ' '),
    count: Number(row[valueKey] || 0),
  })).filter((row) => row.count > 0));
  const total = slices.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card title={title} icon={Activity}>
      {slices.length ? (
        <div className="flex items-center gap-4">
          <div className="relative grid h-28 w-28 shrink-0 place-items-center">
            <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
              {slices.map((slice) => (
                <circle
                  key={`${title}-${slice.label}`}
                  cx="60"
                  cy="60"
                  r="42"
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth="16"
                  strokeDasharray={`${slice.dash} ${slice.gap}`}
                  strokeDashoffset={slice.offset}
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-lg font-semibold tabular-nums text-slate-950">{total}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Total</p>
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            {slices.slice(0, 5).map((slice) => (
              <div key={`${title}-row-${slice.label}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-slate-600">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                  <span className="truncate capitalize">{slice.label}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-slate-900">{slice.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No data yet.</p>
      )}
    </Card>
  );
}

function MetricList({ title, rows }) {
  return (
    <Card title={title} icon={Activity}>
      <MotionStagger className="space-y-3" stagger={0.08}>
        {rows.length ? rows.map((row) => (
          <MotionItem key={row.operation} variant={popUp}>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold capitalize text-slate-800">
                  {String(row.operation).replaceAll('_', ' ')}
                </p>
                {row.value != null ? (
                  <p className="shrink-0 text-sm font-bold tabular-nums text-cyan-800">{row.value}</p>
                ) : null}
              </div>
              {row.detail ? (
                <p className="mt-1 text-xs text-slate-500">{row.detail}</p>
              ) : (
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>Average: {row.average_ms} ms</span>
                  <span>Max: {row.max_ms} ms</span>
                </div>
              )}
            </div>
          </MotionItem>
        )) : (
          <MotionItem variant={fadeUp}>
            <p className="text-sm text-slate-500">Metrics appear after referral activity.</p>
          </MotionItem>
        )}
      </MotionStagger>
    </Card>
  );
}
