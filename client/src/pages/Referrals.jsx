import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  ClipboardPen,
  Clock3,
  History,
  Inbox,
  ListChecks,
  MapPin,
  Send,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../api';
import {
  AnimatedTableRow,
  Card,
  Field,
  FlashMessage,
  FormActions,
  InlineFlash,
  LoadingOverlay,
  PageBlock,
  PageStack,
  ActionButton,
  PrimaryButton,
  SearchableSelect,
  SelectInput,
  toSearchableOptions,
  StatusBadge,
  FloatingActionMenu,
  TableBody,
  TableHead,
  TableHeadCell,
  TableShell,
  PhPhoneInput,
  TextInput,
  useConfirm,
} from '../components/ui';
import { classNames, formatDateTime, priorityLabel } from '../components/helpers';
import { findHealthCenterForBarangay, homeBarangayLabelForCenter, toBarangaySearchableOptions } from '../data/koronadalBarangays';
import { PATIENT_CLASSIFICATION_FIELDS, emptyPatientClassifications } from '../data/patientClassifications';
import { applyServerIssues, normalizePhMobile, validatePatientForm } from '../lib/patientValidation';

const initialReferral = {
  patient_id: '',
  receiving_health_center_id: '',
  referral_reason: '',
  clinical_urgency: 'routine',
  referral_type: 'routine',
  severity_level: 'moderate',
};

const CLINICAL_URGENCY_OPTIONS = [
  { value: 'routine', label: 'Routine' },
  { value: 'urgent', label: 'Urgent' },
];

const REFERRAL_TYPE_OPTIONS = [
  { value: 'routine', label: 'Routine' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'specialist_consultation', label: 'Specialist consultation' },
];

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
];

const REFERRAL_STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'queued', label: 'Queued' },
  { value: 'completed', label: 'Completed' },
  { value: 'missed', label: 'Missed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

const REFERRAL_PRIORITY_FILTER_OPTIONS = [
  { value: '', label: 'Any priority' },
  { value: 'priority_1_emergency', label: 'Priority 1 Emergency' },
  { value: 'priority_2_vulnerable', label: 'Priority 2 Vulnerable' },
  { value: 'priority_3_standard', label: 'Priority 3 Standard' },
];

const clinicalUrgencyOptions = toSearchableOptions(CLINICAL_URGENCY_OPTIONS);
const referralTypeOptions = toSearchableOptions(REFERRAL_TYPE_OPTIONS);
const severityOptions = toSearchableOptions(SEVERITY_OPTIONS);
const referralStatusFilterOptions = toSearchableOptions(REFERRAL_STATUS_FILTER_OPTIONS);
const referralPriorityFilterOptions = toSearchableOptions(REFERRAL_PRIORITY_FILTER_OPTIONS);

const initialQuickPatient = {
  first_name: '',
  middle_name: '',
  last_name: '',
  birth_date: '',
  sex: 'female',
  contact_number: '',
  address: '',
  address2: '',
  city: 'Koronadal City',
  province: 'South Cotabato',
  ...emptyPatientClassifications,
};

const STATUS_GROUPS = {
  pending: ['submitted', 'under_review'],
  active: ['queued'],
  closed: ['completed', 'missed', 'rejected', 'expired', 'archived'],
};

function isQueuedReferral(referral) {
  return referral.status === 'queued' && !referral.is_expired;
}

function needsReferralReview(referral) {
  return STATUS_GROUPS.pending.includes(referral.status);
}

function canArchiveReferral(referral) {
  return ['completed', 'missed', 'rejected', 'expired'].includes(referral.status);
}

function formatAppointment(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatReferralAppointment(referral) {
  const scheduled = formatAppointment(referral.appointment_time || referral.appointment_at);
  if (scheduled) return scheduled;

  if (referral.queue_date) {
    const queueDate = new Date(`${referral.queue_date}T12:00:00`);
    if (!Number.isNaN(queueDate.getTime())) {
      return `Queue ${queueDate.toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
    }
  }

  return '—';
}

function toDatetimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function referralTrackingCode(referral) {
  return referral.tracking_code || referral.referral_code || '—';
}

function formatPersonName(value) {
  const name = String(value || '').trim();
  if (!name || name === '—') return '—';
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function referralPatientName(referral) {
  if (referral.patient_name) return formatPersonName(referral.patient_name);
  const name = [referral.first_name, referral.last_name].filter(Boolean).join(' ').trim();
  return formatPersonName(name);
}

const REFERRAL_ACTION_CONFIRM = {
  complete: {
    title: 'Finish referral?',
    message: 'Mark this referral as completed?',
    confirmLabel: 'Finish',
  },
  cancel: {
    title: 'Cancel referral?',
    message: 'Cancel this referral? The patient will no longer be queued.',
    confirmLabel: 'Cancel referral',
    tone: 'danger',
  },
  'invalid-queue': {
    title: 'Mark as invalid queue?',
    message: 'Mark this queue entry as invalid?',
    confirmLabel: 'Mark invalid',
    tone: 'danger',
  },
  miss: {
    title: 'Mark as missed?',
    message: 'Mark this referral as missed and notify the patient?',
    confirmLabel: 'Mark missed',
    tone: 'danger',
  },
  archive: {
    title: 'Archive referral?',
    message: 'Archive this referral record?',
    confirmLabel: 'Archive',
  },
};

function referralCounts(referrals) {
  return {
    all: referrals.length,
    pending: referrals.filter((referral) => STATUS_GROUPS.pending.includes(referral.status)).length,
    active: referrals.filter((referral) => STATUS_GROUPS.active.includes(referral.status) && !referral.is_expired).length,
    closed: referrals.filter((referral) => STATUS_GROUPS.closed.includes(referral.status)).length,
  };
}

function referralSummary(counts) {
  if (!counts.all) return 'No referrals yet. New submissions will appear here.';
  const waiting = counts.pending
    ? `${counts.pending} ${counts.pending === 1 ? 'is' : 'are'} waiting for a decision`
    : 'Nothing is waiting for a decision';
  const queued = counts.active
    ? `${counts.active} ${counts.active === 1 ? 'is' : 'are'} in the queue`
    : 'the queue is empty';
  const closed = counts.closed
    ? `${counts.closed} ${counts.closed === 1 ? 'is' : 'are'} closed`
    : 'none are closed';
  return `${counts.all} referral${counts.all === 1 ? '' : 's'}. ${waiting}, ${queued}, and ${closed}.`;
}

const STATUS_VIEWS = [
  { id: 'all', label: 'All', hint: 'Every referral' },
  { id: 'pending', label: 'Needs review', hint: 'Waiting for a decision' },
  { id: 'active', label: 'In queue', hint: 'Approved and waiting' },
  { id: 'closed', label: 'Closed', hint: 'Finished or cancelled' },
];

function ReferralStats({ referrals, activeGroup, onSelectGroup }) {
  const counts = useMemo(() => referralCounts(referrals), [referrals]);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {STATUS_VIEWS.map((item) => {
        const selected = activeGroup === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectGroup(item.id)}
            className={classNames(
              'rounded-2xl border px-4 py-3 text-left transition',
              selected
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300',
            )}
          >
            <p className={classNames('text-xs font-medium', selected ? 'text-slate-300' : 'text-slate-500')}>{item.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{counts[item.id]}</p>
            <p className={classNames('mt-1 text-xs', selected ? 'text-slate-300' : 'text-slate-500')}>{item.hint}</p>
          </button>
        );
      })}
    </div>
  );
}

function WorkflowGuide({ canReview }) {
  const steps = canReview
    ? ['Submitted', 'Queued & SMS sent', 'Appointment scheduled', 'Completed']
    : ['Select patient', 'Submit referral', 'Queue & SMS sent', 'Appointment in 24h'];

  return (
    <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 px-3 py-3 sm:rounded-2xl sm:px-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-800 sm:text-xs">
        {canReview ? 'Referral workflow' : 'Instant referral workflow'}
      </p>
      <div className="-mx-1 mt-2 overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-2 px-1 text-xs text-cyan-900">
          {steps.map((step, index) => (
            <span key={step} className="inline-flex items-center gap-2">
              <span className="whitespace-nowrap rounded-full bg-white px-2 py-1 font-medium ring-1 ring-cyan-200">{step}</span>
              {index < steps.length - 1 ? <span className="text-cyan-400">→</span> : null}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Referrals({ patients, healthCenters, referrals, filters, setFilters, canReview, canCreate = !canReview, user, onRefresh }) {
  const [screen, setScreen] = useState(canCreate ? 'new' : 'list');
  const [statusGroup, setStatusGroup] = useState('all');
  const counts = useMemo(() => referralCounts(referrals), [referrals]);

  const filteredReferrals = useMemo(() => {
    let rows = [...referrals];

    if (statusGroup === 'pending') {
      rows = rows.filter((r) => STATUS_GROUPS.pending.includes(r.status));
    } else if (statusGroup === 'active') {
      rows = rows.filter((r) => STATUS_GROUPS.active.includes(r.status) && !r.is_expired);
    } else if (statusGroup === 'closed') {
      rows = rows.filter((r) => STATUS_GROUPS.closed.includes(r.status));
    }

    if (filters.q) {
      const q = filters.q.toLowerCase();
      rows = rows.filter((r) => (
        referralTrackingCode(r).toLowerCase().includes(q)
        || referralPatientName(r).toLowerCase().includes(q)
        || String(r.receiving_center_name || '').toLowerCase().includes(q)
      ));
    }

    if (filters.status) {
      rows = rows.filter((r) => r.status === filters.status);
    }

    if (filters.priority_level) {
      rows = rows.filter((r) => r.priority_level === filters.priority_level);
    }

    return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [referrals, statusGroup, filters]);

  const historyReferrals = useMemo(
    () => [...referrals].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100),
    [referrals],
  );

  function handleStatusGroup(group) {
    setStatusGroup(group);
    setScreen('list');
    setFilters((current) => ({ ...current, status: '' }));
  }

  async function handleReferralCreated() {
    await onRefresh();
    setScreen('list');
    setStatusGroup('all');
  }

  const recordScreens = [
    { id: 'list', label: 'List', icon: Inbox },
    { id: 'history', label: 'History', icon: History },
    ...(canReview ? [{ id: 'sms', label: 'Send SMS', icon: Send }] : []),
  ];

  return (
    <PageStack>
      <PageBlock>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm text-slate-600">{referralSummary(counts)}</p>
          <div className="flex flex-wrap items-center gap-2">
            {canCreate ? (
              <div className="inline-flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setScreen('list')}
                  className={classNames(
                    'rounded-lg px-3 py-2 text-sm font-semibold transition',
                    screen !== 'new' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                  )}
                >
                  Records
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('new')}
                  className={classNames(
                    'rounded-lg px-3 py-2 text-sm font-semibold transition',
                    screen === 'new' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                  )}
                >
                  New referral
                </button>
              </div>
            ) : null}
            {screen !== 'new' ? (
              <div className="inline-flex rounded-xl bg-slate-100 p-1">
                {recordScreens.map((item) => {
                  const Icon = item.icon;
                  const selected = screen === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setScreen(item.id)}
                      className={classNames(
                        'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition',
                        selected ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </PageBlock>

      {screen === 'new' ? (
        <PageBlock>
          <div className="space-y-4">
            <WorkflowGuide canReview={canReview} />
            <ReferralForm
              patients={patients}
              healthCenters={healthCenters}
              user={user}
              onCreated={handleReferralCreated}
            />
          </div>
        </PageBlock>
      ) : null}

      {screen === 'list' ? (
        <PageBlock>
          <div className="space-y-4">
            <ReferralStats referrals={referrals} activeGroup={statusGroup} onSelectGroup={handleStatusGroup} />
            <ReferralTable
              referrals={filteredReferrals}
              totalCount={referrals.length}
              onRefresh={onRefresh}
              canReview={canReview}
              canTransfer
              healthCenters={healthCenters}
              filters={filters}
              setFilters={setFilters}
              statusGroup={statusGroup}
              onShowAll={() => handleStatusGroup('all')}
            />
          </div>
        </PageBlock>
      ) : null}

      {screen === 'history' ? (
        <PageBlock>
          <ReferralHistory referrals={historyReferrals} />
        </PageBlock>
      ) : null}

      {screen === 'sms' && canReview ? (
        <PageBlock>
          <ManualSmsPanel referrals={referrals} onRefresh={onRefresh} />
        </PageBlock>
      ) : null}
    </PageStack>
  );
}

function ReferralForm({ patients, healthCenters, user, onCreated }) {
  const confirm = useConfirm();
  const [form, setForm] = useState(initialReferral);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [patientMode, setPatientMode] = useState('existing');
  const [quickPatient, setQuickPatient] = useState(initialQuickPatient);
  const [patientMessage, setPatientMessage] = useState('');
  const [patientError, setPatientError] = useState('');
  const [patientFieldErrors, setPatientFieldErrors] = useState({});
  const [registeringPatient, setRegisteringPatient] = useState(false);
  const receivingCenters = healthCenters.filter((center) => center.status === 'active');
  const defaultHealthCenterId = healthCenters.find((center) => center.type === 'barangay' && center.status === 'active')?.id;
  const staffCenter = healthCenters.find((center) => Number(center.id) === Number(user?.health_center_id));
  const lockedAddress = user?.role === 'barangay_staff' ? homeBarangayLabelForCenter(staffCenter) : '';

  useEffect(() => {
    if (!lockedAddress) return undefined;
    setQuickPatient((current) => (current.address === lockedAddress ? current : { ...current, address: lockedAddress }));
    return undefined;
  }, [lockedAddress]);
  const patientOptions = useMemo(
    () => patients.map((patient) => {
      const fullName = [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(' ');
      const hintParts = [normalizePhMobile(patient.contact_number) || patient.contact_number, patient.health_center_name, formatDateTime(patient.created_at)].filter(Boolean);
      return {
        value: String(patient.id),
        label: fullName,
        hint: hintParts.join(' · ') || 'No contact on file',
        searchText: [fullName, patient.contact_number, patient.city, patient.health_center_name, patient.email].join(' '),
      };
    }),
    [patients],
  );
  const receivingCenterOptions = useMemo(
    () => receivingCenters.map((center) => ({
      value: String(center.id),
      label: center.name,
      hint: [center.barangay_name ? `Barangay ${center.barangay_name}` : center.type, center.address].filter(Boolean).join(' · ') || 'Checkup location',
      searchText: [center.name, center.barangay_name, center.address, center.type].join(' '),
    })),
    [receivingCenters],
  );
  const selectedPatient = patients.find((patient) => String(patient.id) === String(form.patient_id));
  const patientContact = patientMode === 'new' ? quickPatient.contact_number : selectedPatient?.contact_number;
  const canSubmitReferral = form.patient_id && form.receiving_health_center_id && form.referral_reason.trim() && patientContact;

  function updateQuickPatient(key, value) {
    setQuickPatient((current) => ({ ...current, [key]: value }));
  }

  async function registerPatient(event) {
    event.preventDefault();
    setPatientMessage('');
    setPatientError('');

    const result = validatePatientForm({
      ...quickPatient,
      email: quickPatient.email || '',
      postal_code: quickPatient.postal_code || '9506',
    }, { requireContact: true });
    if (!result.ok) {
      setPatientFieldErrors(result.errors);
      setPatientError(result.summary || 'Please correct the highlighted patient fields.');
      return;
    }

    const confirmed = await confirm({
      title: 'Register patient?',
      message: 'Save this patient and use them for this referral?',
      confirmLabel: 'Register & select',
    });
    if (!confirmed) return;

    const matchedCenter = findHealthCenterForBarangay(result.values.address, healthCenters);
    const healthCenterId = user?.role === 'barangay_staff'
      ? user.health_center_id
      : (matchedCenter?.id || defaultHealthCenterId);

    if (!healthCenterId) {
      setPatientError('No barangay health center is available for registration.');
      return;
    }

    setRegisteringPatient(true);
    try {
      const created = await api('/patients', {
        method: 'POST',
        body: JSON.stringify({
          ...result.values,
          health_center_id: Number(healthCenterId),
        }),
      });
      await onCreated();
      setForm((current) => ({
        ...current,
        patient_id: String(created.id),
        receiving_health_center_id: String(created.health_center_id || healthCenterId),
      }));
      setQuickPatient({ ...initialQuickPatient, address: lockedAddress });
      setPatientFieldErrors({});
      setPatientMode('existing');
      setPatientMessage(
        `${created.first_name} ${created.last_name} registered ${formatDateTime(created.created_at)} at ${created.health_center_name || 'the health center'} and selected.`,
      );
    } catch (err) {
      if (err.issues?.length) setPatientFieldErrors(applyServerIssues(err.issues));
      setPatientError(err.message);
    } finally {
      setRegisteringPatient(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');

    if (patientMode === 'new' && !form.patient_id) {
      setError('Register the patient first using "Register & select patient", or switch to Existing patient.');
      return;
    }

    if (!canSubmitReferral) {
      setError('Select a patient with a mobile number, receiving center, and referral reason.');
      return;
    }

    const confirmed = await confirm({
      title: 'Submit referral?',
      message: 'Submit this referral? A queue number, appointment (~24h), and SMS will be sent automatically.',
      confirmLabel: 'Submit referral',
    });
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const created = await api('/referrals', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          patient_id: Number(form.patient_id),
          receiving_health_center_id: Number(form.receiving_health_center_id),
        }),
      });
      setForm(initialReferral);
      const trackingCode = created.tracking_code || created.referral_code;
      const queueLabel = created.queue_number ? ` · Queue ${created.queue_number}` : '';
      const smsNote = created.sms_status === 'sent'
        ? 'SMS sent to patient'
        : created.sms_error
          ? `SMS failed: ${created.sms_error}`
          : 'SMS not sent';
      setMessage(`Queued · ${trackingCode}${queueLabel} · ${smsNote}`);
      onCreated();
    } catch (err) {
      const details = err.issues?.length
        ? err.issues.map((issue) => `${issue.field}: ${issue.message}`).join(' ')
        : err.message;
      setError(details);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <LoadingOverlay open={submitting} label="Submitting" />
      <LoadingOverlay open={registeringPatient} label="Registering patient" />
      <Card title="New Referral" icon={ClipboardList}>
        <p className="mb-4 text-sm text-slate-500">
          Submit a referral to instantly assign queue priority, schedule an appointment (~24 hours), and notify the patient by SMS.
        </p>
        <form onSubmit={submit} className="space-y-5">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPatientMode('existing')}
                    className={classNames(
                      'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                      patientMode === 'existing'
                        ? 'border-cyan-300 bg-cyan-50 text-cyan-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <Users className="h-4 w-4" />
                    Existing patient
                  </button>
                  <button
                    type="button"
                    onClick={() => setPatientMode('new')}
                    className={classNames(
                      'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                      patientMode === 'new'
                        ? 'border-cyan-300 bg-cyan-50 text-cyan-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <UserPlus className="h-4 w-4" />
                    Register new patient
                  </button>
                </div>

                {patientMode === 'existing' ? (
                  <div className="space-y-4">
                    <Field label="Patient">
                      <SearchableSelect
                        value={form.patient_id}
                        onChange={(nextValue) => {
                          const patient = patients.find((item) => String(item.id) === String(nextValue));
                          setForm({
                            ...form,
                            patient_id: nextValue,
                            receiving_health_center_id: patient?.health_center_id
                              ? String(patient.health_center_id)
                              : form.receiving_health_center_id,
                          });
                        }}
                        options={patientOptions}
                        placeholder="Select patient"
                        searchPlaceholder="Search name or mobile number…"
                        emptyMessage="No patients match your search"
                        required
                      />
                      {selectedPatient && (
                        <p className="mt-1.5 text-xs text-slate-500">
                          Registered {formatDateTime(selectedPatient.created_at)} at {selectedPatient.health_center_name || '—'}.
                          {' '}
                          {selectedPatient.contact_number
                            ? `SMS will be sent to ${normalizePhMobile(selectedPatient.contact_number) || selectedPatient.contact_number}.`
                            : 'This patient has no registered mobile number. Add one before submitting.'}
                        </p>
                      )}
                    </Field>
                    <Field label="Checkup location">
                      <SearchableSelect
                        value={form.receiving_health_center_id}
                        onChange={(nextValue) => setForm({ ...form, receiving_health_center_id: nextValue })}
                        options={receivingCenterOptions}
                        placeholder="Select barangay health center"
                        searchPlaceholder="Search barangay or center…"
                        emptyMessage="No health centers match your search"
                        required
                      />
                      <p className="mt-1.5 text-xs text-slate-500">
                        Defaults to the patient’s home barangay. Transfer to another barangay health center if needed.
                      </p>
                    </Field>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <p className="mb-3 text-sm font-medium text-emerald-900">Quick patient registration</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="First name" error={patientFieldErrors.first_name}>
                        <TextInput value={quickPatient.first_name} onChange={(event) => updateQuickPatient('first_name', event.target.value)} aria-invalid={Boolean(patientFieldErrors.first_name)} required />
                      </Field>
                      <Field label="Middle name" error={patientFieldErrors.middle_name}>
                        <TextInput value={quickPatient.middle_name} onChange={(event) => updateQuickPatient('middle_name', event.target.value)} aria-invalid={Boolean(patientFieldErrors.middle_name)} />
                      </Field>
                      <Field label="Last name" error={patientFieldErrors.last_name}>
                        <TextInput value={quickPatient.last_name} onChange={(event) => updateQuickPatient('last_name', event.target.value)} aria-invalid={Boolean(patientFieldErrors.last_name)} required />
                      </Field>
                      <Field label="Birth date" error={patientFieldErrors.birth_date}>
                        <TextInput type="date" value={quickPatient.birth_date} onChange={(event) => updateQuickPatient('birth_date', event.target.value)} aria-invalid={Boolean(patientFieldErrors.birth_date)} required />
                      </Field>
                      <Field label="Sex" error={patientFieldErrors.sex}>
                        <SelectInput value={quickPatient.sex} onChange={(event) => updateQuickPatient('sex', event.target.value)}>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                          <option value="other">Other</option>
                        </SelectInput>
                      </Field>
                      <Field label="Contact number" error={patientFieldErrors.contact_number} hint="Philippine mobile: +63 then 10 digits starting with 9">
                        <PhPhoneInput value={quickPatient.contact_number} onChange={(event) => updateQuickPatient('contact_number', event.target.value)} aria-invalid={Boolean(patientFieldErrors.contact_number)} required />
                      </Field>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <Field label="Address 1" error={patientFieldErrors.address}>
                          <SearchableSelect
                            value={quickPatient.address}
                            onChange={(nextValue) => updateQuickPatient('address', nextValue)}
                            options={toBarangaySearchableOptions(quickPatient.address)}
                            placeholder="Select barangay"
                            searchPlaceholder="Search barangay…"
                            emptyMessage="No barangay matches your search"
                            disabled={Boolean(lockedAddress)}
                            required
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <Field label="Address 2 (optional)">
                          <TextInput value={quickPatient.address2} onChange={(event) => updateQuickPatient('address2', event.target.value)} placeholder="Add (optional)" />
                        </Field>
                      </div>
                      <Field label="City" error={patientFieldErrors.city}>
                        <TextInput value={quickPatient.city} onChange={(event) => updateQuickPatient('city', event.target.value)} aria-invalid={Boolean(patientFieldErrors.city)} />
                      </Field>
                      <Field label="Province" error={patientFieldErrors.province}>
                        <TextInput value={quickPatient.province} onChange={(event) => updateQuickPatient('province', event.target.value)} aria-invalid={Boolean(patientFieldErrors.province)} />
                      </Field>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {PATIENT_CLASSIFICATION_FIELDS.map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-emerald-100">
                          <input
                            type="checkbox"
                            checked={quickPatient[key]}
                            onChange={(event) => updateQuickPatient(key, event.target.checked)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-emerald-800">
                      Registration stamp: {formatDateTime(new Date())} at {user?.health_center_name || 'the registering health center'}.
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                      <PrimaryButton
                        type="button"
                        className="w-full sm:w-auto"
                        disabled={registeringPatient || !quickPatient.first_name || !quickPatient.last_name || !quickPatient.birth_date || !quickPatient.address || !normalizePhMobile(quickPatient.contact_number)}
                        onClick={registerPatient}
                      >
                        Register & select patient
                      </PrimaryButton>
                      <InlineFlash message={patientMessage} type="success" />
                    </div>
                    <div className="mt-3">
                      <FlashMessage message={patientError} type="error" />
                    </div>
                  </div>
                )}

                {patientMode === 'existing' ? null : (
                  <Field label="Checkup location">
                    <SearchableSelect
                      value={form.receiving_health_center_id}
                      onChange={(nextValue) => setForm({ ...form, receiving_health_center_id: nextValue })}
                      options={receivingCenterOptions}
                      placeholder="Select barangay health center"
                      searchPlaceholder="Search barangay or center…"
                      emptyMessage="No health centers match your search"
                      required
                    />
                  </Field>
                )}

                {patientMessage && patientMode === 'existing' ? (
                  <InlineFlash message={patientMessage} type="success" />
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Classification</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Clinical urgency">
                    <SearchableSelect
                      value={form.clinical_urgency}
                      onChange={(nextValue) => setForm({ ...form, clinical_urgency: nextValue })}
                      options={clinicalUrgencyOptions}
                      placeholder="Select urgency"
                      searchPlaceholder="Search urgency…"
                    />
                  </Field>
                  <Field label="Referral type">
                    <SearchableSelect
                      value={form.referral_type}
                      onChange={(nextValue) => setForm({ ...form, referral_type: nextValue })}
                      options={referralTypeOptions}
                      placeholder="Select type"
                      searchPlaceholder="Search referral type…"
                    />
                  </Field>
                  <Field label="Severity">
                    <SearchableSelect
                      value={form.severity_level}
                      onChange={(nextValue) => setForm({ ...form, severity_level: nextValue })}
                      options={severityOptions}
                      placeholder="Select severity"
                      searchPlaceholder="Search severity…"
                    />
                  </Field>
                </div>
              </div>

              <Field label="Referral reason">
                <textarea
                  value={form.referral_reason}
                  onChange={(event) => setForm({ ...form, referral_reason: event.target.value })}
                  required
                  rows={4}
                  placeholder="Describe the reason for referral..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                />
              </Field>

              <p className="text-xs text-slate-500">
                A registered mobile number is required. SMS includes patient name, queue code, and tracker code.
              </p>

              <FormActions className="border-t border-slate-100 pt-4">
                <PrimaryButton className="w-full sm:w-auto" disabled={!canSubmitReferral || submitting}>
                  Submit referral
                </PrimaryButton>
                <InlineFlash message={message} type="success" />
              </FormActions>
              <FlashMessage message={error} type="error" />
        </form>
      </Card>
    </>
  );
}

function ReferralReviewPanel({ referral, mode, decision, setDecision, onSubmit, onClose, error }) {
  return (
    <div className="rounded-2xl border border-cyan-200 bg-cyan-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {mode === 'schedule' ? 'Schedule appointment' : 'Review referral'}
          </p>
          <p className="text-xs text-slate-500">
            {referralTrackingCode(referral)} · {referralPatientName(referral)}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          Close
        </button>
      </div>
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
        {mode === 'review' ? (
          <Field label="Decision">
            <SelectInput value={decision.status} onChange={(event) => setDecision({ ...decision, status: event.target.value })}>
              <option value="approved">Approve — assign queue & send SMS</option>
              <option value="rejected">Reject — notify patient</option>
            </SelectInput>
          </Field>
        ) : null}
        <Field label="Appointment (optional for approval)">
          <TextInput
            type="datetime-local"
            value={decision.appointment_time}
            onChange={(event) => setDecision({ ...decision, appointment_time: event.target.value })}
            required={mode === 'schedule'}
          />
        </Field>
        {mode === 'review' && decision.status === 'rejected' ? (
          <div className="md:col-span-2">
            <Field label="Rejection reason">
              <TextInput
                value={decision.rejection_reason}
                onChange={(event) => setDecision({ ...decision, rejection_reason: event.target.value })}
                placeholder="Reason shown to patient in SMS"
                required
              />
            </Field>
          </div>
        ) : null}
        <div className="flex gap-2 md:col-span-2">
          <PrimaryButton>{mode === 'schedule' ? 'Save appointment' : 'Save decision'}</PrimaryButton>
        </div>
        <div className="md:col-span-2">
          <FlashMessage message={error} type="error" />
        </div>
      </form>
    </div>
  );
}

function ReferralRowActions({ referral, canReview, canTransfer = false, rowBusy, onReview, onSchedule, onAction, onTransfer, stacked = false }) {
  const wrapClass = stacked
    ? 'flex flex-col gap-2 sm:flex-row sm:flex-wrap'
    : 'inline-flex flex-nowrap items-center gap-1.5';

  const transferButton = canTransfer && isQueuedReferral(referral) ? (
    <ActionButton variant="neutral" icon={MapPin} disabled={rowBusy} onClick={() => onTransfer(referral)}>
      Transfer location
    </ActionButton>
  ) : null;

  if (!canReview) {
    if (transferButton) return <div className={wrapClass}>{transferButton}</div>;
    return <span className="text-xs text-slate-400">Awaiting city review</span>;
  }

  if (needsReferralReview(referral)) {
    return (
      <div className={wrapClass}>
        <ActionButton variant="info" icon={ClipboardPen} disabled={rowBusy} onClick={() => onReview(referral)}>
          Review
        </ActionButton>
      </div>
    );
  }

  if (isQueuedReferral(referral)) {
    const moreMenu = ({ close }) => (
      <>
        {canTransfer ? (
          <button type="button" disabled={rowBusy} onClick={() => { onTransfer(referral); close(); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50">
            Transfer checkup location
          </button>
        ) : null}
        <button type="button" disabled={rowBusy} onClick={() => { onSchedule(referral); close(); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50">
          Schedule appointment
        </button>
        <button type="button" disabled={rowBusy} onClick={() => { onAction(referral.id, 'miss'); close(); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50">Mark missed</button>
        <button type="button" disabled={rowBusy} onClick={() => { onAction(referral.id, 'cancel'); close(); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50">Cancel</button>
        <button type="button" disabled={rowBusy} onClick={() => { onAction(referral.id, 'invalid-queue'); close(); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50">Invalid queue</button>
      </>
    );

    if (stacked) {
      return (
        <div className={wrapClass}>
          <ActionButton variant="info" icon={CalendarClock} disabled={rowBusy} onClick={() => onSchedule(referral)}>
            Schedule
          </ActionButton>
          <ActionButton variant="success" icon={CheckCircle2} disabled={rowBusy} onClick={() => onAction(referral.id, 'complete')}>
            Finish
          </ActionButton>
          <FloatingActionMenu
            label="More"
            icon={ChevronDown}
            disabled={rowBusy}
            triggerClassName="w-full rounded-xl px-3 py-2 sm:w-auto"
          >
            {moreMenu}
          </FloatingActionMenu>
        </div>
      );
    }

    return (
      <div className={wrapClass}>
        <ActionButton variant="success" icon={CheckCircle2} disabled={rowBusy} onClick={() => onAction(referral.id, 'complete')}>
          Finish
        </ActionButton>
        <FloatingActionMenu
          label="More"
          icon={ChevronDown}
          disabled={rowBusy}
        >
          {moreMenu}
        </FloatingActionMenu>
      </div>
    );
  }

  if (canArchiveReferral(referral)) {
    return (
      <div className={wrapClass}>
        <ActionButton variant="neutral" icon={Archive} disabled={rowBusy} onClick={() => onAction(referral.id, 'archive')}>
          Archive
        </ActionButton>
      </div>
    );
  }

  return <span className="text-xs text-slate-400">—</span>;
}

function ReferralFilters({ filters, setFilters }) {
  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const hasFilters = Boolean(filters.q || filters.status || filters.priority_level);

  function clearFilters() {
    setFilters({ q: '', status: '', priority_level: '' });
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-3">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="block min-w-0 sm:col-span-2 xl:col-span-1">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Search</span>
            <TextInput
              value={filters.q}
              onChange={(event) => updateFilter('q', event.target.value)}
              placeholder="Tracking code or patient"
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</span>
            <SearchableSelect
              value={filters.status}
              onChange={(nextValue) => updateFilter('status', nextValue)}
              options={referralStatusFilterOptions}
              placeholder="Any status"
              searchPlaceholder="Search status…"
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Priority</span>
            <SearchableSelect
              value={filters.priority_level}
              onChange={(nextValue) => updateFilter('priority_level', nextValue)}
              options={referralPriorityFilterOptions}
              placeholder="Any priority"
              searchPlaceholder="Search priority…"
            />
          </label>
        </div>
        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 lg:mb-0.5"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ReferralRecordCard({
  referral,
  canReview,
  rowBusy,
  isExpanded,
  reviewMode,
  decision,
  setDecision,
  onReview,
  onSchedule,
  onAction,
  onTransfer,
  onSubmitReview,
  onCloseReview,
  actionError,
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-semibold text-slate-800">{referralTrackingCode(referral)}</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{referralPatientName(referral)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{referral.receiving_center_name}</p>
        </div>
        <StatusBadge value={referral.status} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <dt className="text-slate-500">Priority</dt>
          <dd className="mt-0.5 font-medium text-slate-800">{priorityLabel(referral.priority_level)}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <dt className="text-slate-500">Queue</dt>
          <dd className="mt-0.5 font-medium text-slate-800">{referral.queue_number ? `#${referral.queue_number}` : '—'}</dd>
        </div>
        <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2">
          <dt className="text-slate-500">Appointment</dt>
          <dd className="mt-0.5 font-medium text-slate-800">{formatReferralAppointment(referral)}</dd>
        </div>
      </dl>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <ReferralRowActions
          referral={referral}
          canReview={canReview}
          canTransfer
          rowBusy={rowBusy}
          onReview={onReview}
          onSchedule={onSchedule}
          onAction={onAction}
          onTransfer={onTransfer}
          stacked
        />
      </div>

      {isExpanded ? (
        <div className="mt-3">
          <ReferralReviewPanel
            referral={referral}
            mode={reviewMode}
            decision={decision}
            setDecision={setDecision}
            onSubmit={onSubmitReview}
            onClose={onCloseReview}
            error={actionError}
          />
        </div>
      ) : null}
    </article>
  );
}

function ReferralTable({ referrals, totalCount, onRefresh, canReview, canTransfer = false, healthCenters = [], filters, setFilters, statusGroup, onShowAll }) {
  const confirm = useConfirm();
  const [reviewing, setReviewing] = useState(null);
  const [reviewMode, setReviewMode] = useState('review');
  const [actionError, setActionError] = useState('');
  const [actingId, setActingId] = useState(null);
  const [decision, setDecision] = useState({ status: 'approved', appointment_time: '', rejection_reason: '' });
  const [transferring, setTransferring] = useState(null);
  const [transferCenterId, setTransferCenterId] = useState('');

  function openReview(referral, mode = 'review') {
    setActionError('');
    setReviewMode(mode);
    setReviewing(referral);
    setDecision({
      status: 'approved',
      appointment_time: toDatetimeLocalValue(referral.appointment_time || referral.appointment_at),
      rejection_reason: '',
    });
  }

  async function startReview(referral) {
    setActionError('');
    setActingId(referral.id);
    try {
      if (referral.status === 'submitted') {
        await api(`/referrals/${referral.id}/review`, { method: 'POST' });
        await onRefresh();
      }
      openReview({ ...referral, status: referral.status === 'submitted' ? 'under_review' : referral.status }, 'review');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActingId(null);
    }
  }

  async function submitReview(event) {
    event.preventDefault();
    setActionError('');

    let confirmOptions;
    if (reviewMode === 'schedule') {
      if (!decision.appointment_time) {
        setActionError('Select an appointment date and time.');
        return;
      }
      confirmOptions = {
        title: 'Save appointment?',
        message: 'Set this appointment date and time for the referral?',
        confirmLabel: 'Save appointment',
      };
    } else if (decision.status === 'approved') {
      confirmOptions = {
        title: 'Approve referral?',
        message: 'Approve this referral, assign queue priority, and notify the patient?',
        confirmLabel: 'Approve',
      };
    } else {
      confirmOptions = {
        title: 'Reject referral?',
        message: 'Reject this referral? The patient will be notified.',
        confirmLabel: 'Reject',
        tone: 'danger',
      };
    }

    const confirmed = await confirm(confirmOptions);
    if (!confirmed) return;

    try {
      if (reviewMode === 'schedule') {
        await api(`/referrals/${reviewing.id}/appointment`, {
          method: 'POST',
          body: JSON.stringify({ appointment_at: decision.appointment_time }),
        });
      } else if (decision.status === 'approved') {
        await api(`/referrals/${reviewing.id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ appointment_at: decision.appointment_time || null }),
        });
      } else {
        await api(`/referrals/${reviewing.id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ rejection_reason: decision.rejection_reason || 'Rejected during review.' }),
        });
      }
      setReviewing(null);
      await onRefresh();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function action(id, endpoint) {
    const confirmOptions = REFERRAL_ACTION_CONFIRM[endpoint];
    if (!confirmOptions) return;

    const confirmed = await confirm(confirmOptions);
    if (!confirmed) return;

    setActionError('');
    setActingId(id);
    try {
      if (endpoint === 'miss') {
        await api(`/referrals/${id}/miss`, { method: 'POST' });
      } else {
        await api(`/referrals/${id}/${endpoint}`, { method: 'POST' });
      }
      await onRefresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActingId(null);
    }
  }

  function startTransfer(referral) {
    const cityCenter = healthCenters.find((center) => center.type === 'city' && center.status === 'active');
    setActionError('');
    setTransferring(referral);
    setTransferCenterId(cityCenter ? String(cityCenter.id) : '');
  }

  async function submitTransfer(event) {
    event.preventDefault();
    if (!transferring) return;
    const confirmed = await confirm({
      title: 'Transfer checkup location?',
      message: 'Move this checkup to the city health center and send the patient another SMS?',
      confirmLabel: 'Transfer',
    });
    if (!confirmed) return;

    setActingId(transferring.id);
    try {
      const result = await api(`/referrals/${transferring.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ receiving_health_center_id: Number(transferCenterId) }),
      });
      setTransferring(null);
      if (result.sms_status && result.sms_status !== 'sent' && result.sms_status !== 'skipped') {
        setActionError(`Checkup transferred, but the SMS was not sent. ${result.sms_error || ''}`.trim());
      }
      await onRefresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActingId(null);
    }
  }

  const isActing = (id) => actingId === id;
  const groupCopy = {
    all: { title: 'All referrals', detail: 'Newest referrals first. Use search or priority to narrow the list.' },
    pending: { title: 'Needs review', detail: 'These referrals are submitted and still need a decision.' },
    active: { title: 'In queue', detail: 'These referrals are approved and waiting for their appointment.' },
    closed: { title: 'Closed', detail: 'Completed, missed, rejected, or cancelled referrals.' },
  }[statusGroup] || { title: 'Referrals', detail: 'Filtered referrals.' };
  const hasNarrowingFilters = Boolean(filters.q || filters.status || filters.priority_level);

  return (
    <Card title={groupCopy.title} icon={ListChecks}>
      <p className="mb-4 text-sm text-slate-500">{groupCopy.detail}</p>

      <div className="mb-4">
        <ReferralFilters filters={filters} setFilters={setFilters} />
      </div>

      {transferring ? (
        <form onSubmit={submitTransfer} className="mb-4 grid gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4 sm:grid-cols-[1fr_auto]">
          <Field label={`Transfer ${referralPatientName(transferring)} checkup to`}>
            <SearchableSelect
              value={transferCenterId}
              onChange={setTransferCenterId}
              options={healthCenters.filter((center) => center.type === 'city' && center.status === 'active').map((center) => ({
                value: String(center.id),
                label: center.name,
                hint: 'City health center',
                searchText: [center.name, center.address].join(' '),
              }))}
              placeholder="Select city health center"
              searchPlaceholder="Search city health center…"
              emptyMessage="No city health center is available"
              required
            />
          </Field>
          <div className="flex items-end gap-2">
            <PrimaryButton disabled={isActing(transferring.id)}>Transfer</PrimaryButton>
            <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={() => setTransferring(null)}>Cancel</button>
          </div>
        </form>
      ) : null}

      {actionError && !reviewing ? (
        <div className="mb-4">
          <FlashMessage message={actionError} type="error" />
        </div>
      ) : null}

      {referrals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center sm:px-6">
          <Inbox className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-800">
            {hasNarrowingFilters ? 'No referrals match this search' : {
              all: 'No referrals yet',
              pending: 'Nothing is waiting for review',
              active: 'The queue is empty',
              closed: 'No closed referrals',
            }[statusGroup] || 'No referrals in this view'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {hasNarrowingFilters
              ? 'Clear the search or priority filter to see this group again.'
              : statusGroup === 'all'
                ? 'New referrals will show up in this list.'
                : `${totalCount} referral${totalCount === 1 ? ' is' : 's are'} in the other groups.`}
          </p>
          {statusGroup !== 'all' && !hasNarrowingFilters && totalCount > 0 ? (
            <button
              type="button"
              onClick={onShowAll}
              className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Show all referrals
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {referrals.map((referral) => (
              <ReferralRecordCard
                key={referral.id}
                referral={referral}
                canReview={canReview}
                rowBusy={isActing(referral.id)}
                isExpanded={reviewing?.id === referral.id}
                reviewMode={reviewMode}
                decision={decision}
                setDecision={setDecision}
                onReview={startReview}
                onSchedule={(row) => openReview(row, 'schedule')}
                onAction={action}
                onTransfer={startTransfer}
                onSubmitReview={submitReview}
                onCloseReview={() => setReviewing(null)}
                actionError={actionError}
              />
            ))}
          </div>

          <div className="hidden lg:block">
            <TableShell minWidth="880px">
              <TableHead>
                <TableHeadCell className="w-[18%]">Tracking</TableHeadCell>
                <TableHeadCell className="w-[14%]">Patient</TableHeadCell>
                <TableHeadCell className="w-[10%]">Status</TableHeadCell>
                <TableHeadCell className="w-[16%]">Priority / Queue</TableHeadCell>
                <TableHeadCell className="w-[18%]">Appointment</TableHeadCell>
                <TableHeadCell className="w-[12%] text-right">Actions</TableHeadCell>
              </TableHead>
              <TableBody>
                {referrals.map((referral, index) => {
                  const rowBusy = isActing(referral.id);
                  const isExpanded = reviewing?.id === referral.id;

                  return (
                    <Fragment key={referral.id}>
                      <AnimatedTableRow index={index}>
                        <td className="px-4 py-3 align-top">
                          <p className="font-mono text-xs font-semibold text-slate-800">{referralTrackingCode(referral)}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{referral.checkup_location || referral.receiving_center_name}</p>
                          {referral.home_barangay ? (
                            <p className="mt-0.5 text-xs text-slate-400">Home: {referral.home_barangay}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top text-sm font-medium text-slate-800">{referralPatientName(referral)}</td>
                        <td className="px-4 py-3 align-top"><StatusBadge value={referral.status} /></td>
                        <td className="px-4 py-3 align-top">
                          <p className="text-sm font-medium text-slate-800">{priorityLabel(referral.priority_level)}</p>
                          {referral.queue_number ? (
                            <p className="mt-0.5 text-xs text-slate-500">Queue #{referral.queue_number}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top text-sm text-slate-700">{formatReferralAppointment(referral)}</td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end">
                            <ReferralRowActions
                              referral={referral}
                              canReview={canReview}
                              canTransfer={canTransfer}
                              rowBusy={rowBusy}
                              onReview={startReview}
                              onSchedule={(row) => openReview(row, 'schedule')}
                              onAction={action}
                              onTransfer={startTransfer}
                            />
                          </div>
                        </td>
                      </AnimatedTableRow>
                      {isExpanded ? (
                        <tr>
                          <td colSpan={6} className="border-b border-slate-100 bg-white p-3">
                            <ReferralReviewPanel
                              referral={referral}
                              mode={reviewMode}
                              decision={decision}
                              setDecision={setDecision}
                              onSubmit={submitReview}
                              onClose={() => setReviewing(null)}
                              error={actionError}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </TableShell>
          </div>
        </>
      )}
    </Card>
  );
}

function ReferralHistory({ referrals }) {
  return (
    <Card title="Referral history" icon={History}>
      <p className="mb-4 text-sm text-slate-500">Chronological log of all submissions and outcomes.</p>
      {referrals.length === 0 ? (
        <p className="text-sm text-slate-500">No referral history yet.</p>
      ) : (
        <div className="space-y-3">
          {referrals.map((referral) => (
            <div key={referral.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-800">{referralTrackingCode(referral)}</span>
                  <StatusBadge value={referral.status} />
                </div>
                <p className="mt-1 text-sm font-medium text-slate-800">{referralPatientName(referral)}</p>
                <p className="mt-0.5 text-xs text-slate-500">{referral.receiving_center_name}</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <div className="inline-flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5" />
                  {new Date(referral.created_at).toLocaleString()}
                </div>
                {referral.queue_number ? (
                  <p className="mt-1 font-medium text-slate-700">Queue #{referral.queue_number}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ManualSmsPanel({ referrals, onRefresh }) {
  const confirm = useConfirm();
  const [form, setForm] = useState({ referral_id: '', message: '' });
  const [status, setStatus] = useState('');
  const eligibleReferrals = useMemo(() => referrals.filter((referral) => referral.contact_number), [referrals]);

  async function submit(event) {
    event.preventDefault();
    setStatus('');

    const confirmed = await confirm({
      title: 'Send SMS?',
      message: 'Send this manual SMS to the patient?',
      confirmLabel: 'Send SMS',
    });
    if (!confirmed) return;

    await api('/sms/manual', { method: 'POST', body: JSON.stringify({ ...form, referral_id: Number(form.referral_id) }) });
    setForm({ referral_id: '', message: '' });
    setStatus('Manual SMS sent.');
    await onRefresh();
  }

  return (
    <Card title="Manual SMS" icon={Send}>
      <p className="mb-4 text-sm text-slate-500">
        Send a one-off message to a patient with a contact number on file.
      </p>
      <form onSubmit={submit} className="grid max-w-2xl gap-3">
        <Field label="Referral">
          <SelectInput value={form.referral_id} onChange={(event) => setForm({ ...form, referral_id: event.target.value })} required>
            <option value="">Select referral</option>
            {eligibleReferrals.map((referral) => (
              <option key={referral.id} value={referral.id}>
                {referralTrackingCode(referral)} — {referralPatientName(referral)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Message">
          <textarea
            value={form.message}
            onChange={(event) => setForm({ ...form, message: event.target.value })}
            required
            rows={3}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
          />
        </Field>
        <FormActions className="border-t-0 pt-0">
          <PrimaryButton>Send SMS</PrimaryButton>
          <InlineFlash message={status} type="success" />
        </FormActions>
      </form>
    </Card>
  );
}
