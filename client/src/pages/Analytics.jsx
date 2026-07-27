import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { downloadCsv } from '../api';
import {
  AnimatedGrid,
  AnimatedGridItem,
  Card,
  MotionStagger,
  PageBlock,
  ReportList,
  easeOut,
  popUp,
} from '../components/ui';

const MotionDiv = motion.div;

export default function Analytics({ analytics }) {
  const exports = [
    ['/analytics/export/referrals.csv', 'Export referrals CSV'],
    ['/analytics/export/patients.csv', 'Export patients CSV'],
    ['/analytics/export/queue.csv', 'Export queue CSV'],
    ['/analytics/export/sms.csv', 'Export SMS CSV'],
    ['/evaluations/export.csv', 'Export evaluations CSV'],
  ];

  const reports = [
    { title: 'Referrals by Status', rows: analytics.referralsByStatus || [], labelKey: 'status' },
    { title: 'Queue by Priority', rows: analytics.queueByPriority || [], labelKey: 'priority_level' },
    { title: 'Average Wait Time', rows: analytics.averageWaitTime || [], labelKey: 'priority_level', valueKey: 'average_wait_minutes', suffix: ' min' },
    { title: 'SMS Delivery', rows: analytics.smsDelivery || [], labelKey: 'status' },
    { title: 'Peak Hours', rows: analytics.peakHours || [], labelKey: 'hour' },
    { title: 'Staff Performance', rows: analytics.staffPerformance || [], labelKey: 'staff_name', valueKey: 'reviewed' },
    { title: 'Queue Abandonment', rows: analytics.queueAbandonmentRate || [], labelKey: 'label', valueKey: 'rate_percent', suffix: '%' },
    { title: 'Patient Satisfaction Trends', rows: analytics.patientSatisfactionTrends || [], labelKey: 'date', valueKey: 'average_rating' },
    { title: 'Volume Forecast', rows: analytics.volumeForecast || [], labelKey: 'label', valueKey: 'estimated_referrals' },
    { title: 'Performance Metrics', rows: analytics.performance || [], labelKey: 'operation', valueKey: 'average_ms', suffix: ' ms' },
  ];

  return (
    <PageBlock>
      <Card title="Analytics and Reports" icon={Activity}>
        <AnimatedGrid className="mb-4 flex flex-wrap gap-2">
          {exports.map(([href, label]) => (
            <AnimatedGridItem key={href}>
              <button
                type="button"
                onClick={() => downloadCsv(href)}
                className="inline-block rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800"
              >
                {label}
              </button>
            </AnimatedGridItem>
          ))}
        </AnimatedGrid>
        <MotionStagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" stagger={0.08}>
          {reports.map((report) => (
            <MotionDiv key={report.title} variants={popUp} transition={{ duration: 0.5, ease: easeOut }}>
              <ReportList
                title={report.title}
                rows={report.rows}
                labelKey={report.labelKey}
                valueKey={report.valueKey}
                suffix={report.suffix}
              />
            </MotionDiv>
          ))}
        </MotionStagger>
      </Card>
    </PageBlock>
  );
}
