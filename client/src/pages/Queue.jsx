import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '../api';
import {
  AnimatedTableRow,
  Card,
  FlashMessage,
  PageBlock,
  StatusBadge,
  useConfirm,
} from '../components/ui';
import { priorityLabel } from '../components/helpers';

const CALL_COOLDOWN_MS = 60_000;

function queuePatientName(entry) {
  if (entry.patient_name) return entry.patient_name;
  const name = [entry.first_name, entry.last_name].filter(Boolean).join(' ').trim();
  return name || '—';
}

function queueStatus(entry) {
  return entry.status || entry.queue_status || 'unknown';
}

function canCallPatient(entry) {
  return ['waiting', 'called'].includes(queueStatus(entry));
}

function callCooldownSeconds(calledAt, now) {
  if (!calledAt) return 0;
  const calledMs = new Date(calledAt).getTime();
  const remaining = CALL_COOLDOWN_MS - (now - calledMs);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export default function Queue({ queue, onRefresh }) {
  const confirm = useConfirm();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [callingId, setCallingId] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function callPatient(id) {
    const confirmed = await confirm({
      title: 'Call patient?',
      message: 'Send an SMS and email notification to call this patient?',
      confirmLabel: 'Call patient',
    });
    if (!confirmed) return;

    setError('');
    setSuccess('');
    setCallingId(id);
    try {
      const data = await api(`/queue/${id}/call`, { method: 'POST' });
      setSuccess(data.message || 'Call notification sent to patient.');
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setCallingId(null);
    }
  }

  return (
    <PageBlock>
      <Card title="Priority Queue" icon={Bell}>
        <FlashMessage message={error} type="error" className="mb-4" />
        <FlashMessage message={success} type="success" className="mb-4" />

        {queue.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            No active queue entries for today. Submit a new referral to add patients to the queue.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-2">Queue #</th>
                  <th className="p-2">Patient</th>
                  <th className="p-2">Priority</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((entry, index) => {
                  const callable = canCallPatient(entry);
                  const cooldown = callCooldownSeconds(entry.called_at, now);
                  const isCalling = callingId === entry.id;

                  return (
                    <AnimatedTableRow key={entry.id} index={index}>
                      <td className="p-2 font-mono text-xs text-slate-800">{entry.queue_number}</td>
                      <td className="p-2 text-slate-800">{queuePatientName(entry)}</td>
                      <td className="p-2">{priorityLabel(entry.priority_level)}</td>
                      <td className="p-2"><StatusBadge value={queueStatus(entry)} /></td>
                      <td className="p-2">
                        {callable ? (
                          cooldown > 0 ? (
                            <span className="text-xs font-medium text-slate-500">
                              Call again in {cooldown}s
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="font-medium text-cyan-700 disabled:opacity-50"
                              disabled={isCalling}
                              onClick={() => callPatient(entry.id)}
                            >
                              {isCalling ? 'Sending…' : 'Call patient'}
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-slate-400">No actions</span>
                        )}
                      </td>
                    </AnimatedTableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageBlock>
  );
}
