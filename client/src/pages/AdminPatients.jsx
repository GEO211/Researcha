import { useMemo, useState } from 'react';
import { Archive, Building2, ChevronLeft, MapPin, Search } from 'lucide-react';
import { api } from '../api';
import { classNames, formatDateTime } from '../components/helpers';
import {
  Card,
  FlashMessage,
  SearchableSelect,
  TextInput,
  useConfirm,
} from '../components/ui';

const ARCHIVE_REASONS = [
  { value: 'duplicate', label: 'Duplicate entry', hint: 'This person is already registered' },
  { value: 'transferred', label: 'Transferred out', hint: 'Move this record to another barangay' },
  { value: 'deceased', label: 'Deceased', hint: 'Keep the record for history' },
  { value: 'other', label: 'Other', hint: 'Write a short reason' },
];

const RECORD_VIEWS = [
  { id: 'active', label: 'Active' },
  { id: 'archived', label: 'Archived' },
  { id: 'all', label: 'All' },
];

function reasonLabel(code) {
  return ARCHIVE_REASONS.find((item) => item.value === code)?.label || code || 'Archived';
}

function patientName(patient) {
  return [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(' ');
}

function formatBirthDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  let local = digits.startsWith('63') ? digits.slice(2) : digits;
  if (local.startsWith('0')) local = local.slice(1);
  if (local.length !== 10) return value || '—';
  return `+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

export default function PatientDirectory({ patients = [], healthCenters = [], onRefresh }) {
  const confirm = useConfirm();
  const [centerQuery, setCenterQuery] = useState('');
  const [screen, setScreen] = useState('centers');
  const [selectedCenterId, setSelectedCenterId] = useState(null);
  const [patientQuery, setPatientQuery] = useState('');
  const [recordView, setRecordView] = useState('active');
  const [archiving, setArchiving] = useState(null);
  const [transferring, setTransferring] = useState(null);
  const [transferCenterId, setTransferCenterId] = useState('');
  const [reason, setReason] = useState('duplicate');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const centers = useMemo(() => {
    return [...healthCenters]
      .map((center) => {
        const rows = patients.filter((patient) => Number(patient.health_center_id) === Number(center.id));
        return {
          ...center,
          total: rows.length,
          active: rows.filter((patient) => (patient.record_status || 'active') !== 'archived').length,
          archived: rows.filter((patient) => patient.record_status === 'archived').length,
        };
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'city' ? -1 : 1;
        return String(a.name).localeCompare(String(b.name));
      });
  }, [healthCenters, patients]);

  const visibleCenters = centers.filter((center) => {
    const query = centerQuery.trim().toLowerCase();
    if (!query) return true;
    return [center.name, center.address, center.type].some((value) => String(value || '').toLowerCase().includes(query));
  });

  const selectedCenter = centers.find((center) => Number(center.id) === Number(selectedCenterId)) || null;
  const centerPatients = patients.filter((patient) => Number(patient.health_center_id) === Number(selectedCenterId));
  const viewCounts = {
    active: centerPatients.filter((patient) => (patient.record_status || 'active') !== 'archived').length,
    archived: centerPatients.filter((patient) => patient.record_status === 'archived').length,
    all: centerPatients.length,
  };
  const visiblePatients = centerPatients.filter((patient) => {
    const status = patient.record_status || 'active';
    if (recordView === 'active' && status === 'archived') return false;
    if (recordView === 'archived' && status !== 'archived') return false;
    const query = patientQuery.trim().toLowerCase();
    if (!query) return true;
    return [patientName(patient), patient.contact_number, patient.email, patient.sex]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });

  const totalActive = patients.filter((patient) => (patient.record_status || 'active') !== 'archived').length;
  const totalArchived = patients.filter((patient) => patient.record_status === 'archived').length;
  const activePatients = patients
    .filter((patient) => (patient.record_status || 'active') !== 'archived')
    .filter((patient) => {
      const query = patientQuery.trim().toLowerCase();
      if (!query) return true;
      return [patientName(patient), patient.contact_number, patient.health_center_name]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  const archivedPatients = patients
    .filter((patient) => patient.record_status === 'archived')
    .filter((patient) => {
      const query = patientQuery.trim().toLowerCase();
      if (!query) return true;
      return [patientName(patient), patient.contact_number, patient.health_center_name, reasonLabel(patient.archive_reason)]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });

  function openCenters() {
    setScreen('centers');
    setSelectedCenterId(null);
    setPatientQuery('');
    setRecordView('active');
    setArchiving(null);
    setTransferring(null);
    setError('');
    setNotice('');
  }

  function openCenter(centerId) {
    setScreen('center');
    setSelectedCenterId(centerId);
    setPatientQuery('');
    setRecordView('active');
    setArchiving(null);
    setTransferring(null);
    setError('');
    setNotice('');
  }

  function openAllActive() {
    setScreen('active');
    setSelectedCenterId(null);
    setPatientQuery('');
    setArchiving(null);
    setTransferring(null);
    setError('');
    setNotice('');
  }

  function openAllArchived() {
    setScreen('archived');
    setSelectedCenterId(null);
    setPatientQuery('');
    setArchiving(null);
    setTransferring(null);
    setError('');
    setNotice('');
  }

  function barangayChoices(patient) {
    return healthCenters
      .filter((center) => center.type === 'barangay' && center.status === 'active' && Number(center.id) !== Number(patient?.health_center_id))
      .map((center) => ({
        value: String(center.id),
        label: center.name,
        hint: 'Barangay health center',
        searchText: [center.name, center.address, center.barangay_name].filter(Boolean).join(' '),
      }));
  }

  function openArchive(patient) {
    if (screen !== 'center') {
      setScreen('center');
      setSelectedCenterId(patient.health_center_id);
      setRecordView('active');
    }
    setArchiving(patient);
    setTransferring(null);
    setReason('duplicate');
    setNote('');
    setTransferCenterId('');
    setError('');
    setNotice('');
  }

  function openTransfer(patient) {
    if (screen !== 'center') {
      setScreen('center');
      setSelectedCenterId(patient.health_center_id);
      setRecordView('active');
    }
    setTransferring(patient);
    setArchiving(null);
    setTransferCenterId('');
    setError('');
    setNotice('');
  }

  async function submitArchive(event) {
    event.preventDefault();
    if (!archiving) return;
    if (reason === 'other' && note.trim().length < 3) {
      setError('Write a short reason before archiving this record.');
      return;
    }
    if (reason === 'transferred') {
      await submitTransfer(archiving, transferCenterId);
      return;
    }
    const confirmed = await confirm({
      title: 'Archive patient record?',
      message: `${patientName(archiving)} stays on file with their referrals. The record is deactivated, not deleted.`,
      confirmLabel: 'Archive record',
      tone: 'danger',
    });
    if (!confirmed) return;

    setBusy(true);
    setError('');
    try {
      await api(`/patients/${archiving.id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ reason, note: note.trim() }),
      });
      setArchiving(null);
      setNotice(`${patientName(archiving)} is archived. The referral history stays on file.`);
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitTransfer(patient, centerId) {
    const destination = healthCenters.find((center) => String(center.id) === String(centerId));
    if (!patient || !destination) {
      setError('Choose the barangay health center.');
      return;
    }
    const confirmed = await confirm({
      title: 'Transfer to barangay?',
      message: `Move ${patientName(patient)} to ${destination.name}? The record stays active there.`,
      confirmLabel: 'Transfer',
    });
    if (!confirmed) return;

    setBusy(true);
    setError('');
    try {
      await api(`/patients/${patient.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ health_center_id: Number(destination.id) }),
      });
      setArchiving(null);
      setTransferring(null);
      setNotice(`${patientName(patient)} is now registered at ${destination.name}.`);
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function restorePatient(patient) {
    const confirmed = await confirm({
      title: 'Restore patient record?',
      message: `${patientName(patient)} will be active again at ${patient.health_center_name || selectedCenter?.name || 'this health center'}.`,
      confirmLabel: 'Restore',
    });
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      await api(`/patients/${patient.id}/restore`, { method: 'POST' });
      setNotice(`${patientName(patient)} is active again.`);
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Patients" icon={Building2}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
          Choose the health center that registered the patient. Archiving deactivates the record and keeps the referral history.
        </p>
        {screen !== 'archived' ? (
          <button
            type="button"
            onClick={openAllArchived}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
          >
            <Archive className="h-4 w-4" />
            Show all archived
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{totalArchived}</span>
          </button>
        ) : null}
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { id: 'centers', label: 'Health centers', count: centers.length, onClick: openCenters },
          { id: 'active', label: 'Active patients', count: totalActive, onClick: openAllActive },
          { id: 'archived', label: 'Archived', count: totalArchived, onClick: openAllArchived },
        ].map((item) => {
          const selected = screen === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={classNames(
                'rounded-2xl border px-4 py-3 text-left transition',
                selected ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <p className={classNames('text-xs font-medium', selected ? 'text-slate-300' : 'text-slate-500')}>{item.label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{item.count}</p>
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="mb-4">
          <FlashMessage message={error} type="error" />
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4">
          <FlashMessage message={notice} type="success" />
        </div>
      ) : null}

      {screen === 'centers' ? (
        <div>
          <label className="mb-3 block max-w-md">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Find a health center</span>
            <TextInput
              value={centerQuery}
              onChange={(event) => setCenterQuery(event.target.value)}
              placeholder="Search by center name"
            />
          </label>
          {visibleCenters.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              No health center matches that search.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleCenters.map((center) => (
                <button
                  key={center.id}
                  type="button"
                  onClick={() => openCenter(center.id)}
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">{center.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {center.type === 'city' ? 'City health center' : 'Barangay health center'}
                        {center.status !== 'active' ? ' · Inactive' : ''}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{center.active}</span>
                  </div>
                  <p className="mt-4 text-xs text-slate-500">
                    {center.active} active · {center.archived} archived
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {screen === 'active' ? (
        <div>
          <button
            type="button"
            onClick={openCenters}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            All health centers
          </button>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-950">All active patients</h3>
              <p className="mt-1 text-sm text-slate-500">Every active record, grouped by the health center that registered them.</p>
            </div>
            <label className="block w-full max-w-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Search active patients</span>
              <TextInput
                value={patientQuery}
                onChange={(event) => setPatientQuery(event.target.value)}
                placeholder="Name, contact, or center"
              />
            </label>
          </div>
          {activePatients.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              {patientQuery ? 'No active patient matches that search.' : 'No active patient records yet.'}
            </p>
          ) : (
            <ActivePatientTable
              patients={activePatients}
              busy={busy}
              onTransfer={openTransfer}
              onArchive={openArchive}
            />
          )}
        </div>
      ) : null}

      {screen === 'archived' ? (
        <div>
          <button
            type="button"
            onClick={openCenters}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            All health centers
          </button>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-950">All archived records</h3>
              <p className="mt-1 text-sm text-slate-500">Deactivated patients from every health center. Referral history stays on file.</p>
            </div>
            <label className="block w-full max-w-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Search archived records</span>
              <TextInput
                value={patientQuery}
                onChange={(event) => setPatientQuery(event.target.value)}
                placeholder="Name, center, or reason"
              />
            </label>
          </div>
          {archivedPatients.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              {patientQuery ? 'No archived record matches that search.' : 'No patient records are archived yet.'}
            </p>
          ) : (
            <PatientTable
              patients={archivedPatients}
              showCenter
              busy={busy}
              onRestore={restorePatient}
            />
          )}
        </div>
      ) : null}

      {screen === 'center' && selectedCenter ? (
        <div>
          <button
            type="button"
            onClick={openCenters}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            All health centers
          </button>
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">{selectedCenter.name}</h3>
            <p className="mt-1 text-sm text-slate-500">Patients registered at this health center.</p>
          </div>

          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {RECORD_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setRecordView(view.id)}
                  className={classNames(
                    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold',
                    recordView === view.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                  )}
                >
                  {view.label}
                  <span className={classNames(
                    'rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                    recordView === view.id ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/70 text-slate-500',
                  )}
                  >
                    {viewCounts[view.id]}
                  </span>
                </button>
              ))}
            </div>
            <label className="block w-full max-w-sm">
              <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Search className="h-3.5 w-3.5" />
                Search this center
              </span>
              <TextInput
                value={patientQuery}
                onChange={(event) => setPatientQuery(event.target.value)}
                placeholder="Name or contact number"
              />
            </label>
          </div>

          {archiving ? (
            <form onSubmit={submitArchive} className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Archive {patientName(archiving)}</p>
              <p className="mt-1 text-sm text-slate-500">Choose a reason. The record and its referrals stay in the audit history.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {ARCHIVE_REASONS.map((item) => (
                  <label key={item.value} className={`cursor-pointer rounded-xl border px-3 py-2 ${reason === item.value ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white'}`}>
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="archive-reason"
                        value={item.value}
                        checked={reason === item.value}
                        onChange={() => setReason(item.value)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-800">{item.label}</span>
                        <span className="block text-xs text-slate-500">{item.hint}</span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {reason === 'transferred' ? (
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Barangay health center</span>
                  <SearchableSelect
                    value={transferCenterId}
                    onChange={setTransferCenterId}
                    options={barangayChoices(archiving)}
                    placeholder="Choose a barangay"
                    searchPlaceholder="Search barangay…"
                    emptyMessage="No other barangay health center is available"
                    required
                  />
                </label>
              ) : (
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">
                    {reason === 'other' ? 'Reason' : 'Note (optional)'}
                  </span>
                  <TextInput
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={reason === 'other' ? 'Why is this record being archived?' : 'Add a note for the audit log'}
                    required={reason === 'other'}
                  />
                </label>
              )}
              <div className="mt-3 flex gap-2">
                <button type="submit" disabled={busy} className="rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                  {reason === 'transferred' ? 'Transfer to barangay' : 'Archive record'}
                </button>
                <button type="button" className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700" onClick={() => setArchiving(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {transferring ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitTransfer(transferring, transferCenterId);
              }}
              className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <p className="text-sm font-semibold text-slate-900">Transfer {patientName(transferring)} to a barangay</p>
              <p className="mt-1 text-sm text-slate-500">The record stays active at the barangay you choose. Referral history stays with the patient.</p>
              <label className="mt-3 block max-w-lg">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Barangay health center</span>
                <SearchableSelect
                  value={transferCenterId}
                  onChange={setTransferCenterId}
                  options={barangayChoices(transferring)}
                  placeholder="Choose a barangay"
                  searchPlaceholder="Search barangay…"
                  emptyMessage="No other barangay health center is available"
                  required
                />
              </label>
              <div className="mt-3 flex gap-2">
                <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                  <MapPin className="h-4 w-4" />
                  Transfer to barangay
                </button>
                <button type="button" className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700" onClick={() => setTransferring(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {visiblePatients.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              {patientQuery ? 'No patient at this center matches that search.' : 'No patients are registered at this health center yet.'}
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Patient</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Birth date</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Sex</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Contact</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Registered</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Record</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visiblePatients.map((patient) => {
                      const archived = patient.record_status === 'archived';
                      return (
                        <tr key={patient.id} className="align-top hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-medium text-slate-900">{patientName(patient)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatBirthDate(patient.birth_date)}</td>
                          <td className="whitespace-nowrap px-4 py-3 capitalize text-slate-700">{patient.sex || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatPhone(patient.contact_number)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDateTime(patient.created_at)}</td>
                          <td className="px-4 py-3">
                            {archived ? (
                              <div>
                                <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">Archived</span>
                                <p className="mt-1 text-xs text-slate-500">{reasonLabel(patient.archive_reason)}</p>
                                {patient.archive_note ? <p className="text-xs text-slate-500">{patient.archive_note}</p> : null}
                                <p className="text-xs text-slate-400">{formatDateTime(patient.archived_at)}</p>
                              </div>
                            ) : (
                              <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {archived ? (
                              <button type="button" disabled={busy} onClick={() => restorePatient(patient)} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                                Restore
                              </button>
                            ) : (
                              <div className="flex justify-end gap-1.5">
                                <button type="button" disabled={busy} onClick={() => openTransfer(patient)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60">
                                  <MapPin className="h-3.5 w-3.5" />
                                  Transfer
                                </button>
                                <button type="button" disabled={busy} onClick={() => openArchive(patient)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                                  <Archive className="h-3.5 w-3.5" />
                                  Archive
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function PatientTable({ patients, showCenter = false, busy, onRestore }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Patient</th>
              {showCenter ? <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Health center</th> : null}
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Birth date</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Contact</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Reason</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Archived</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {patients.map((patient) => (
              <tr key={patient.id} className="align-top hover:bg-slate-50/70">
                <td className="px-4 py-3 font-medium text-slate-900">{patientName(patient)}</td>
                {showCenter ? <td className="px-4 py-3 text-slate-700">{patient.health_center_name || '—'}</td> : null}
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatBirthDate(patient.birth_date)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatPhone(patient.contact_number)}</td>
                <td className="px-4 py-3 text-slate-700">
                  <p>{reasonLabel(patient.archive_reason)}</p>
                  {patient.archive_note ? <p className="mt-0.5 text-xs text-slate-500">{patient.archive_note}</p> : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDateTime(patient.archived_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" disabled={busy} onClick={() => onRestore(patient)} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                    Restore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActivePatientTable({ patients, busy, onTransfer, onArchive }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Patient</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Health center</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Birth date</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Contact</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {patients.map((patient) => (
              <tr key={patient.id} className="align-top hover:bg-slate-50/70">
                <td className="px-4 py-3 font-medium text-slate-900">{patientName(patient)}</td>
                <td className="px-4 py-3 text-slate-700">{patient.health_center_name || '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatBirthDate(patient.birth_date)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatPhone(patient.contact_number)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1.5">
                    <button type="button" disabled={busy} onClick={() => onTransfer(patient)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60">
                      <MapPin className="h-3.5 w-3.5" />
                      Transfer
                    </button>
                    <button type="button" disabled={busy} onClick={() => onArchive(patient)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
