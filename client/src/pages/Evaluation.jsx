import { useState } from 'react';
import { ClipboardList, Heart, Star } from 'lucide-react';
import { api } from '../api';
import {
  AnimatedTableRow,
  Card,
  CountUp,
  Field,
  FormActions,
  InlineFlash,
  PageBlock,
  PageStack,
  PrimaryButton,
  SelectInput,
  StatTile,
  TextInput,
  useConfirm,
} from '../components/ui';

const SUS_QUESTIONS = [
  'I think I would like to use CareLink frequently.',
  'I found CareLink unnecessarily complex.',
  'I thought CareLink was easy to use.',
  'I think I would need support to use CareLink.',
  'I found the various functions in CareLink were well integrated.',
  'I thought there was too much inconsistency in CareLink.',
  'I imagine most people would learn CareLink quickly.',
  'I found CareLink very cumbersome to use.',
  'I felt very confident using CareLink.',
  'I needed to learn a lot before I could get going with CareLink.',
];

const TAM_QUESTIONS = [
  'CareLink improves referral coordination at our health center.',
  'Using CareLink enhances the quality of patient referral services.',
  'CareLink helps me complete referral tasks more quickly.',
  'CareLink is easy to learn and use.',
  'I find CareLink clear and straightforward.',
];

function LikertScale({ value, onChange }) {
  return (
    <SelectInput value={value} onChange={(event) => onChange(Number(event.target.value))}>
      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} — {['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'][n - 1]}</option>)}
    </SelectInput>
  );
}

export default function Evaluation({ evaluationData, canReview, session, onRefresh }) {
  const confirm = useConfirm();
  const [activeForm, setActiveForm] = useState('patient');
  const [patientForm, setPatientForm] = useState({ tracking_code: '', rating: '5', comments: '' });
  const [staffMeta, setStaffMeta] = useState({ respondent_name: session?.user?.name || '', respondent_role: session?.user?.role || 'barangay_staff' });
  const [susAnswers, setSusAnswers] = useState(Array(10).fill(3));
  const [tamAnswers, setTamAnswers] = useState(Array(5).fill(4));
  const [message, setMessage] = useState('');

  async function submitPatient(event) {
    event.preventDefault();
    const confirmed = await confirm({ title: 'Submit evaluation?', message: 'Submit patient satisfaction feedback?', confirmLabel: 'Submit' });
    if (!confirmed) return;

    await api('/evaluations/patient', {
      method: 'POST',
      body: JSON.stringify({ ...patientForm, rating: Number(patientForm.rating) }),
    });
    setPatientForm({ tracking_code: '', rating: '5', comments: '' });
    setMessage('Patient satisfaction submitted.');
    await onRefresh();
  }

  async function submitStaffSurvey(event, surveyType) {
    event.preventDefault();
    const answers = surveyType === 'sus' ? susAnswers : tamAnswers;
    const score = Math.round((answers.reduce((sum, n) => sum + n, 0) / answers.length) * 20);

    const confirmed = await confirm({
      title: `Submit ${surveyType.toUpperCase()} survey?`,
      message: 'Submit your system evaluation responses?',
      confirmLabel: 'Submit survey',
    });
    if (!confirmed) return;

    await api('/evaluations', {
      method: 'POST',
      body: JSON.stringify({
        survey_type: surveyType,
        respondent_role: staffMeta.respondent_role,
        respondent_name: staffMeta.respondent_name,
        score,
        answers,
      }),
    });
    setMessage(`${surveyType.toUpperCase()} survey submitted.`);
    await onRefresh();
  }

  const patientSummary = evaluationData.patientSummary || {};
  const responses = (evaluationData.responses || evaluationData.recent || []).filter(
    (row) => row.survey_type === 'patient_satisfaction' || row.tracking_code,
  );

  return (
    <PageStack>
      <PageBlock>
        <Card title="Evaluation Forms" icon={ClipboardList}>
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              { id: 'patient', label: 'Patient satisfaction', icon: Heart },
              { id: 'sus', label: 'SUS (Staff)', icon: Star },
              { id: 'tam', label: 'TAM (Staff)', icon: Star },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveForm(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${activeForm === tab.id ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-200 bg-white text-slate-700'}`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeForm === 'patient' ? (
            <form onSubmit={submitPatient} className="grid gap-3 md:grid-cols-3">
              <Field label="Tracking code"><TextInput value={patientForm.tracking_code} onChange={(e) => setPatientForm({ ...patientForm, tracking_code: e.target.value })} required /></Field>
              <Field label="Rating"><SelectInput value={patientForm.rating} onChange={(e) => setPatientForm({ ...patientForm, rating: e.target.value })}>{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r}</option>)}</SelectInput></Field>
              <Field label="Comments"><TextInput value={patientForm.comments} onChange={(e) => setPatientForm({ ...patientForm, comments: e.target.value })} /></Field>
              <FormActions className="md:col-span-3"><PrimaryButton>Submit patient evaluation</PrimaryButton><InlineFlash message={message} type="success" /></FormActions>
            </form>
          ) : null}

          {activeForm === 'sus' ? (
            <form onSubmit={(e) => submitStaffSurvey(e, 'sus')} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Your name"><TextInput value={staffMeta.respondent_name} onChange={(e) => setStaffMeta({ ...staffMeta, respondent_name: e.target.value })} /></Field>
                <Field label="Your role"><SelectInput value={staffMeta.respondent_role} onChange={(e) => setStaffMeta({ ...staffMeta, respondent_role: e.target.value })}><option value="barangay_staff">Barangay Staff</option><option value="city_staff">City Staff</option><option value="super_admin">Super Admin</option></SelectInput></Field>
              </div>
              {SUS_QUESTIONS.map((question, index) => (
                <Field key={question} label={`${index + 1}. ${question}`}>
                  <LikertScale value={susAnswers[index]} onChange={(value) => setSusAnswers(susAnswers.map((a, i) => (i === index ? value : a)))} />
                </Field>
              ))}
              <FormActions><PrimaryButton>Submit SUS survey</PrimaryButton><InlineFlash message={message} type="success" /></FormActions>
            </form>
          ) : null}

          {activeForm === 'tam' ? (
            <form onSubmit={(e) => submitStaffSurvey(e, 'tam')} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Your name"><TextInput value={staffMeta.respondent_name} onChange={(e) => setStaffMeta({ ...staffMeta, respondent_name: e.target.value })} /></Field>
                <Field label="Your role"><SelectInput value={staffMeta.respondent_role} onChange={(e) => setStaffMeta({ ...staffMeta, respondent_role: e.target.value })}><option value="barangay_staff">Barangay Staff</option><option value="city_staff">City Staff</option><option value="super_admin">Super Admin</option></SelectInput></Field>
              </div>
              {TAM_QUESTIONS.map((question, index) => (
                <Field key={question} label={`${index + 1}. ${question}`}>
                  <LikertScale value={tamAnswers[index]} onChange={(value) => setTamAnswers(tamAnswers.map((a, i) => (i === index ? value : a)))} />
                </Field>
              ))}
              <FormActions><PrimaryButton>Submit TAM survey</PrimaryButton><InlineFlash message={message} type="success" /></FormActions>
            </form>
          ) : null}
        </Card>
      </PageBlock>

      {canReview ? (
        <PageBlock>
          <Card title="Evaluation Results" icon={ClipboardList}>
            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <StatTile><p className="text-sm text-slate-500">Patient responses</p><p className="text-3xl font-bold tabular-nums"><CountUp to={patientSummary.total || 0} duration={1.4} /></p></StatTile>
              <StatTile><p className="text-sm text-slate-500">Average patient rating</p><p className="text-3xl font-bold tabular-nums"><CountUp to={Number(patientSummary.average_rating || 0)} duration={1.4} /></p></StatTile>
              <StatTile><p className="text-sm text-slate-500">Staff surveys</p><p className="text-3xl font-bold tabular-nums"><CountUp to={(evaluationData.summary || []).reduce((sum, row) => sum + row.count, 0)} duration={1.4} /></p></StatTile>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr><th className="p-2">Type</th><th className="p-2">Tracking</th><th className="p-2">Rating/Score</th><th className="p-2">Comments</th><th className="p-2">Submitted</th></tr></thead>
                <tbody>
                  {responses.map((row, index) => (
                    <AnimatedTableRow key={row.id} index={index}>
                      <td className="p-2">{row.survey_type}</td>
                      <td className="p-2">{row.tracking_code || '—'}</td>
                      <td className="p-2">{row.rating || row.score}</td>
                      <td className="p-2">{row.comments || '—'}</td>
                      <td className="p-2">{new Date(row.created_at).toLocaleString()}</td>
                    </AnimatedTableRow>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </PageBlock>
      ) : null}
    </PageStack>
  );
}
