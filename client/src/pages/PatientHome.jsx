import { HeartPulse } from 'lucide-react';
import { formatDateTime, priorityLabel } from '../components/helpers';
import { Card, PageBlock, PageStack, StatusBadge } from '../components/ui';

export default function PatientHome({ user, tracking }) {
  const result = tracking || user?.tracking || null;

  return (
    <PageStack>
      <PageBlock>
        <Card title="My care status" icon={HeartPulse}>
          <p className="text-sm text-slate-500">
            You are signed in as a patient. CareLink only shows your own referral and queue status.
          </p>
          {result ? (
            <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-900">{result.tracking_code || result.referral_code}</h3>
                <StatusBadge value={result.display_status || result.status} />
              </div>
              <p className="text-sm text-slate-600">{result.status_subtitle || result.status_message || 'Referral found.'}</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Patient</dt>
                  <dd className="font-medium text-slate-900">{result.patient_name || user?.name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Checkup location</dt>
                  <dd className="font-medium text-slate-900">{result.receiving_center_name || user?.health_center_name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Queue</dt>
                  <dd className="font-medium text-slate-900">{result.queue_number || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Priority</dt>
                  <dd className="font-medium text-slate-900">{priorityLabel(result.priority_level)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Appointment</dt>
                  <dd className="font-medium text-slate-900">{formatDateTime(result.appointment_at || result.appointment_time)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
              No referral is linked yet. Open Tracking and enter your referral code.
            </p>
          )}
        </Card>
      </PageBlock>
    </PageStack>
  );
}
