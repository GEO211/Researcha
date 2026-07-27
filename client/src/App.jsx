import { useCallback, useEffect, useMemo, useState } from 'react';
import { HeartPulse, LogOut, Menu, X } from 'lucide-react';
import { api, clearSession, getStoredSession } from './api';
import { classNames, roleLabel, tabIcon, tabLabel } from './components/helpers';
import Admin from './pages/Admin';
import Analytics from './pages/Analytics';
import Dashboard from './pages/Dashboard';
import Evaluation from './pages/Evaluation';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Patients from './pages/Patients';
import Profile from './pages/Profile';
import Queue from './pages/Queue';
import Referrals from './pages/Referrals';
import Tracking from './pages/Tracking';

function App() {
  const [session, setSession] = useState(getStoredSession());
  const pathTrackingCode = window.location.pathname.startsWith('/track/')
    ? decodeURIComponent(window.location.pathname.replace('/track/', '').split('/')[0])
    : '';
  const [activeTab, setActiveTab] = useState(pathTrackingCode ? 'tracking' : 'dashboard');
  const [summary, setSummary] = useState({});
  const [patients, setPatients] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [healthCenters, setHealthCenters] = useState([]);
  const [queue, setQueue] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [users, setUsers] = useState([]);
  const [settingsData, setSettingsData] = useState({ settings: [], rules: [] });
  const [smsLogs, setSmsLogs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [evaluationData, setEvaluationData] = useState({ summary: [], responses: [] });
  const [referralFilters, setReferralFilters] = useState({ q: '', status: '', priority_level: '' });
  const [emailLogs, setEmailLogs] = useState([]);
  const [patientFilters, setPatientFilters] = useState({ q: '', city: '', province: '', contact_number: '', email: '', health_center_id: '' });
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authView, setAuthView] = useState('landing');

  const user = session?.user;
  const canManage = user?.role === 'super_admin';
  const canReview = ['super_admin', 'city_staff'].includes(user?.role);
  const canSubmit = ['super_admin', 'barangay_staff'].includes(user?.role);

  const tabs = useMemo(() => {
    const items = [{ id: 'dashboard', label: 'Dashboard' }];
    if (canSubmit) items.push({ id: 'patients', label: 'Patients' }, { id: 'referrals', label: 'Referrals' });
    if (canReview) items.push({ id: 'queue', label: 'Queue' }, { id: 'analytics', label: 'Analytics' });
    items.push({ id: 'tracking', label: 'Tracking' }, { id: 'evaluation', label: 'Evaluation' }, { id: 'profile', label: 'Profile' });
    if (canManage) items.push({ id: 'admin', label: 'Admin' });
    return items;
  }, [canManage, canReview, canSubmit]);

  const loadData = useCallback(async () => {
    if (!session) return;
    setError('');

    try {
      const referralQuery = new URLSearchParams(
        Object.fromEntries(Object.entries(referralFilters).filter(([, value]) => value)),
      ).toString();
      const patientQuery = new URLSearchParams(
        Object.fromEntries(Object.entries(patientFilters).filter(([, value]) => value)),
      ).toString();
      const baseRequests = [
        api('/dashboard/summary'),
        api(`/patients${patientQuery ? `?${patientQuery}` : ''}`),
        api(`/referrals${referralQuery ? `?${referralQuery}` : ''}`),
        api('/health-centers'),
      ];
      const reviewRequests = canReview
        ? [api('/queue'), api('/analytics'), api('/evaluations')]
        : [Promise.resolve({ queue: [] }), Promise.resolve({}), Promise.resolve({ summary: [], responses: [] })];
      const adminRequests = canManage
        ? [api('/users'), api('/settings'), api('/sms-logs'), api('/audit-logs'), api('/email-logs')]
        : [Promise.resolve({ users: [] }), Promise.resolve({ settings: [], rules: [] }), Promise.resolve({ logs: [] }), Promise.resolve({ logs: [] }), Promise.resolve({ logs: [] })];

      const [
        summaryData,
        patientData,
        referralData,
        centerData,
        queueData,
        analyticsData,
        evaluationResponse,
        userData,
        settingsResponse,
        smsLogData,
        auditLogData,
        emailLogData,
      ] = await Promise.all([...baseRequests, ...reviewRequests, ...adminRequests]);

      setSummary(summaryData);
      setPatients(patientData.patients || []);
      setReferrals(referralData.referrals || []);
      setHealthCenters(centerData.healthCenters || []);
      setQueue(queueData?.queue || []);
      setAnalytics(analyticsData || {});
      setUsers(userData?.users || []);
      setSettingsData(settingsResponse || { settings: [], rules: [] });
      setSmsLogs(smsLogData?.logs || []);
      setAuditLogs(auditLogData?.logs || []);
      setEmailLogs(emailLogData?.logs || []);
      setEvaluationData(evaluationResponse || { summary: [], responses: [], patientSummary: {} });
    } catch (err) {
      setError(err.message);
    }
  }, [canManage, canReview, patientFilters, referralFilters, session]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  function logout() {
    clearSession();
    setSession(null);
    setAuthView('landing');
  }

  function selectTab(tabId) {
    setActiveTab(tabId);
    setSidebarOpen(false);
  }

  if (!session) {
    if (authView === 'login') {
      return <Login onLogin={setSession} onBack={() => setAuthView('landing')} />;
    }
    return (
      <Landing
        onLogin={() => setAuthView('login')}
        initialTrackingCode={pathTrackingCode}
      />
    );
  }

  const sidebar = (
    <aside className="flex h-full flex-col bg-slate-950 text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-cyan-500 p-2.5 text-white shadow-lg shadow-cyan-950/40">
            <HeartPulse className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">CareLink</h1>
            <p className="text-xs text-slate-400">Referral Command Center</p>
          </div>
        </div>
        <button
          type="button"
          className="rounded-xl p-2 text-slate-300 hover:bg-white/10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-4 py-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-sm font-semibold">{user.name}</p>
          <p className="mt-1 text-xs text-slate-400">{roleLabel(user.role)}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{user.health_center_name || 'System-wide access'}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {tabs.map((tab) => {
          const Icon = tabIcon(tab.id);

          return (
            <button
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              className={classNames(
                'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition',
                activeTab === tab.id
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-950/30'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </aside>
  );

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-72">
        {sidebar}
      </div>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar overlay"
          />
          <div className="relative h-full w-80 max-w-[85vw] shadow-2xl">
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">CareLink</p>
                <h2 className="text-xl font-bold tracking-tight text-slate-950">{tabLabel(activeTab)}</h2>
              </div>
            </div>
            <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {user.health_center_name || roleLabel(user.role)}
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
          {error ? <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
          {activeTab === 'dashboard' ? <Dashboard key="dashboard" summary={summary} /> : null}
          {activeTab === 'patients' && canSubmit ? (
            <Patients
              key="patients"
              patients={patients}
              healthCenters={healthCenters}
              user={user}
              filters={patientFilters}
              setFilters={setPatientFilters}
              onRefresh={loadData}
            />
          ) : null}
          {activeTab === 'referrals' && canSubmit ? (
            <Referrals
              key="referrals"
              patients={patients}
              healthCenters={healthCenters}
              referrals={referrals}
              filters={referralFilters}
              setFilters={setReferralFilters}
              canReview={canReview}
              user={user}
              onRefresh={loadData}
            />
          ) : null}
          {activeTab === 'queue' && canReview ? <Queue key="queue" queue={queue} onRefresh={loadData} /> : null}
          {activeTab === 'analytics' && canReview ? <Analytics key="analytics" analytics={analytics} /> : null}
          {activeTab === 'tracking' ? <Tracking key="tracking" initialCode={pathTrackingCode} /> : null}
          {activeTab === 'evaluation' ? <Evaluation key="evaluation" evaluationData={evaluationData} canReview={canReview} session={session} onRefresh={loadData} /> : null}
          {activeTab === 'profile' ? <Profile key="profile" session={session} onSessionUpdate={setSession} /> : null}
          {activeTab === 'admin' && canManage ? (
            <Admin
              key="admin"
              users={users}
              healthCenters={healthCenters}
              settingsData={settingsData}
              smsLogs={smsLogs}
              emailLogs={emailLogs}
              auditLogs={auditLogs}
              onRefresh={loadData}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}

export default App;
