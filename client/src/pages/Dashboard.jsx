import { motion } from 'framer-motion';
import { Activity, LayoutDashboard } from 'lucide-react';
import {
  Card,
  CountUp,
  MotionItem,
  MotionReveal,
  MotionStagger,
  easeOut,
  fadeUp,
  popUp,
} from '../components/ui';

const MotionDiv = motion.div;

export default function Dashboard({ summary }) {
  const referralTotal = summary.referralCounts?.reduce((sum, row) => sum + Number(row.count), 0) || 0;
  const queueTotal = summary.queueCounts?.reduce((sum, row) => sum + Number(row.count), 0) || 0;
  const smsTotal = summary.smsCounts?.reduce((sum, row) => sum + Number(row.count), 0) || 0;
  const operational = summary.operationalCounts || {};
  const completionRate = referralTotal ? Math.round((Number(operational.completed_today || 0) / referralTotal) * 100) : 0;
  const waitingRate = queueTotal ? Math.round((Number(operational.waiting_queue || 0) / queueTotal) * 100) : 0;
  const demographicRows = Object.entries(summary.demographicDistribution || {}).map(([label, value]) => ({
    label,
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

  const statCards = [
    ['Patients', summary.patientCount || 0, 'Registered records'],
    ['Referrals', referralTotal, 'Total submissions'],
    ['Queue Entries', queueTotal, 'Prioritized patients'],
    ['SMS Logs', smsTotal, 'Notification attempts'],
    ['Pending Review', operational.pending_review || 0, 'Awaiting city staff'],
    ['Submitted Today', operational.submitted_today || 0, 'New referrals today'],
    ['Completion Rate', operational.completion_rate || 0, '% of all referrals'],
    ['Missed Today', operational.missed_today || 0, 'Needs follow-up'],
    ['Waiting Queue', operational.waiting_queue || 0, `${waitingRate}% of queue entries`],
  ];

  return (
    <div className="space-y-5">
      <MotionStagger className="grid gap-4 md:grid-cols-4" stagger={0.07}>
        {statCards.map(([label, value, detail], index) => (
          <MotionItem key={label} variant={popUp}>
            <MotionDiv
              whileHover={{ y: -4, scale: 1.02 }}
              transition={{ duration: 0.25, ease: easeOut }}
              className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/60"
            >
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950 tabular-nums">
                <CountUp to={Number(value)} delay={index * 0.06} duration={1.4} />
              </p>
              <p className="mt-1 text-xs text-slate-400">{detail}</p>
            </MotionDiv>
          </MotionItem>
        ))}
      </MotionStagger>

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
            <DonutSummary title="Queue Priority Mix" rows={Object.entries(queueByPriority).map(([label, count]) => ({ label, count }))} labelKey="label" valueKey="count" />
          </MotionItem>
          <MotionItem variant={popUp}>
            <DonutSummary title="SMS Trigger Mix" rows={Object.entries(smsByTrigger).map(([label, count]) => ({ label, count }))} labelKey="label" valueKey="count" />
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

function chartTotal(rows, valueKey) {
  return rows.reduce((sum, row) => sum + Number(row[valueKey] || 0), 0);
}

function BarChart({ title, rows, labelKey, valueKey }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1);

  return (
    <Card title={title} icon={LayoutDashboard}>
      <div className="flex h-72 items-end gap-2 rounded-2xl bg-slate-50 p-4">
        {rows.length ? rows.map((row, index) => {
          const value = Number(row[valueKey] || 0);
          const height = Math.max(8, (value / max) * 210);

          return (
            <MotionDiv
              key={`${title}-${row[labelKey]}`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, delay: index * 0.05, ease: easeOut }}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <div className="text-xs font-semibold text-slate-600">{value}</div>
              <MotionDiv
                initial={{ height: 0, opacity: 0.4 }}
                whileInView={{ height, opacity: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.7, delay: 0.08 + index * 0.05, ease: easeOut }}
                className="w-full origin-bottom rounded-t-xl bg-cyan-600 shadow-sm"
              />
              <div className="w-full truncate text-center text-[10px] text-slate-500">{String(row[labelKey]).slice(0, 10)}</div>
            </MotionDiv>
          );
        }) : (
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex w-full items-center justify-center text-sm text-slate-500"
          >
            No data yet
          </MotionDiv>
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
          const width = Math.max(4, (value / max) * 100);

          return (
            <MotionDiv
              key={`${title}-${row[labelKey]}`}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: index * 0.07, ease: easeOut }}
            >
              <div className="mb-1 flex justify-between text-sm">
                <span className="capitalize text-slate-600">{String(row[labelKey]).replaceAll('_', ' ')}</span>
                <strong className="text-slate-900">{value}</strong>
              </div>
              <div className="h-3 rounded-full bg-slate-100">
                <MotionDiv
                  initial={{ width: 0 }}
                  whileInView={{ width: `${width}%` }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.75, delay: 0.1 + index * 0.07, ease: easeOut }}
                  className="h-3 rounded-full bg-cyan-600"
                />
              </div>
            </MotionDiv>
          );
        }) : (
          <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-slate-500">
            No data yet
          </MotionDiv>
        )}
      </div>
    </Card>
  );
}

function DonutSummary({ title, rows, labelKey, valueKey }) {
  const total = chartTotal(rows, valueKey);
  const top = [...rows].sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0))[0];

  return (
    <Card title={title} icon={Activity}>
      <div className="flex items-center gap-4">
        <MotionDiv
          initial={{ opacity: 0, scale: 0.75, rotate: -12 }}
          whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="grid h-28 w-28 place-items-center rounded-full border-[14px] border-cyan-600 bg-cyan-50"
        >
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-950 tabular-nums">
              <CountUp to={total} duration={1.5} />
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Total</div>
          </div>
        </MotionDiv>
        <div className="min-w-0 flex-1 space-y-2">
          <MotionDiv
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, ease: easeOut }}
          >
            <p className="text-sm text-slate-500">Top segment</p>
            <p className="truncate text-lg font-semibold capitalize text-slate-950">{top ? String(top[labelKey]).replaceAll('_', ' ') : 'No data'}</p>
          </MotionDiv>
          <div className="space-y-1">
            {rows.slice(0, 4).map((row, index) => (
              <MotionDiv
                key={`${title}-${row[labelKey]}`}
                initial={{ opacity: 0, x: 12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.4, delay: 0.08 * index, ease: easeOut }}
                className="flex justify-between text-xs text-slate-500"
              >
                <span className="capitalize">{String(row[labelKey]).replaceAll('_', ' ')}</span>
                <span>{row[valueKey]}</span>
              </MotionDiv>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function MetricList({ title, rows }) {
  return (
    <Card title={title} icon={Activity}>
      <MotionStagger className="space-y-3" stagger={0.08}>
        {rows.length ? rows.map((row) => (
          <MotionItem key={row.operation} variant={popUp}>
            <MotionDiv
              whileHover={{ scale: 1.02, x: 4 }}
              transition={{ duration: 0.2, ease: easeOut }}
              className="rounded-2xl bg-slate-50 p-3"
            >
              <p className="text-sm font-semibold capitalize text-slate-800">{String(row.operation).replaceAll('_', ' ')}</p>
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>Average: {row.average_ms} ms</span>
                <span>Max: {row.max_ms} ms</span>
              </div>
            </MotionDiv>
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
