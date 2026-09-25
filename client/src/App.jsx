import { useCallback, useEffect, useMemo, useState } from 'react';
import { HeartPulse, LogOut, Menu, X } from 'lucide-react';
import { api, clearSession, flushOfflineNow, getStoredSession } from './api';
import { classNames, roleLabel, tabIcon, tabLabel } from './components/helpers';
import { LoadingOverlay } from './components/ui';
import { OfflineBanner } from './components/offline-banner';
import Admin from './pages/Admin';
import Analytics from './pages/Analytics';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Login from './pages/Login';
import PublicQueueBoard from './pages/PublicQueueBoard';
import PatientHome from './pages/PatientHome';
import Patients from './pages/Patients';
import Profile from './pages/Profile';
import Queue from './pages/Queue';
import Referrals from './pages/Referrals';
import Tracking from './pages/Tracking';
import { PERMISSIONS, hasPermission, navigationForRole, permissionsForRole } from '@shared/rbac';

function App() {
  const [session, setSession] = useState(getStoredSession());
  const [publicPath, setPublicPath] = useState(() => window.location.pathname);
  const pathTrackingCode = publicPath.startsWith('/track/')
    ? decodeURIComponent(publicPath.replace('/track/', '').split('/')[0])
    : '';
  const [activeTab, setActiveTab] = useState(() => {
    if (getStoredSession()?.user?.role === 'super_admin') return 'dashboard';
    return pathTrackingCode ? 'tracking' : 'dashboard';
  });
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
  const [referralFilters, setReferralFilters] = useState({ q: '', status: '', priority_level: '' });
  const [emailLogs, setEmailLogs] = useState([]);
  const [patientFilters, setPatientFilters] = useState({ q: '', city: '', province: '', contact_number: '', email: '', health_center_id: '' });
  const [patientTracking, setPatientTracking] = useState(null);
  const [error, setError] = useState('');
  const [dataLoading, setDataLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authView, setAuthView] = useState('landing');

  const user = session?.user;
  const role = user?.role;
  const can = (...keys) => hasPermission(role, ...keys);
  const canManage = can(PERMISSIONS.USERS_MANAGE);
  const canReview = can(PERMISSIONS.REFERRALS_REVIEW);
  const canCreatePatients = can(PERMISSIONS.PATIENTS_CREATE);
  const canCreateReferrals = can(PERMISSIONS.REFERRALS_CREATE);
  const canViewPatients = can(PERMISSIONS.PATIENTS_VIEW) || canCreatePatients;
  const canViewReferrals = can(PERMISSIONS.REFERRALS_VIEW, PERMISSIONS.REFERRALS_CREATE, PERMISSIONS.REFERRALS_REVIEW);
  const canViewCenters = can(PERMISSIONS.CENTERS_VIEW, PERMISSIONS.CENTERS_MANAGE);
  const canViewAnalytics = can(PERMISSIONS.ANALYTICS_VIEW);
  const canUseQueue = can(PERMISSIONS.QUEUE_VIEW);
  const canTrack = can(PERMISSIONS.TRACKING_VIEW, PERMISSIONS.TRACKING_OWN);
  const isPatient = role === 'patient';

  const tabs = useMemo(() => navigationForRole(role), [role]);

  const loadData = useCallback(async () => {
    if (!session) return;
    setDataLoading(true);
    setError('');

    try {
      flushOfflineNow().catch(() => {});
      const referralQuery = new URLSearchParams(
        Object.fromEntries(Object.entries(referralFilters).filter(([, value]) => value)),
      ).toString();
      const patientQuery = new URLSearchParams(
        Object.fromEntries(Object.entries(patientFilters).filter(([, value]) => value)),
      ).toString();

      if (isPatient) {
        const [summaryResult, trackingResult] = await Promise.allSettled([
          api('/dashboard/summary'),
          user?.tracking_code ? api(`/public/track/${encodeURIComponent(user.tracking_code)}`) : Promise.resolve(null),
        ]);
        if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value);
        const trackingData = trackingResult.status === 'fulfilled' ? trackingResult.value : null;
        setPatientTracking(trackingData?.tracking || trackingData || summaryResult.value?.tracking || null);
        if (summaryResult.status === 'rejected' && trackingResult.status === 'rejected') {
          setError(summaryResult.reason?.message || 'Unable to load your care status.');
        }
        setDataReady(true);
        return;
      }

      const core = canManage
        ? await Promise.allSettled([
            api('/dashboard/summary'),
            api('/health-centers'),
          ])
        : await Promise.allSettled([
            api('/dashboard/summary'),
            canViewPatients
              ? api(`/patients${patientQuery ? `?${patientQuery}` : ''}`)
              : Promise.resolve({ patients: [] }),
            canViewReferrals
              ? api(`/referrals${referralQuery ? `?${referralQuery}` : ''}`)
              : Promise.resolve({ referrals: [] }),
            canViewCenters
              ? api('/health-centers')
              : Promise.resolve({ healthCenters: [] }),
          ]);

      if (canManage) {
        const [summaryData, centerData] = core.map((result, index) => {
          if (result.status === 'fulfilled') return result.value;
          const labels = ['dashboard', 'health centers'];
          console.error(`[CareLink] Failed to load ${labels[index]}:`, result.reason);
          return null;
        });
        if (summaryData) setSummary(summaryData);
        setHealthCenters(centerData?.healthCenters || []);
        const failedCore = core.findIndex((result) => result.status === 'rejected');
        if (failedCore !== -1) {
          const labels = ['Dashboard', 'Health centers'];
          setError(core[failedCore].reason?.message || `${labels[failedCore]} failed to load.`);
        }
      } else {
        const [summaryData, patientData, referralData, centerData] = core.map((result, index) => {
          if (result.status === 'fulfilled') return result.value;
          const labels = ['dashboard', 'patients', 'referrals', 'health centers'];
          console.error(`[CareLink] Failed to load ${labels[index]}:`, result.reason);
          return null;
        });

        if (summaryData) setSummary(summaryData);
        setPatients(patientData?.patients || []);
        setReferrals(referralData?.referrals || []);
        setHealthCenters(centerData?.healthCenters || []);

        const failedCore = core.findIndex((result) => result.status === 'rejected');
        if (failedCore !== -1) {
          const labels = ['Dashboard', 'Patients', 'Referrals', 'Health centers'];
          setError(core[failedCore].reason?.message || `${labels[failedCore]} failed to load.`);
        }
      }

      const reviewRequests = [
        canUseQueue ? api('/queue') : Promise.resolve({ queue: [] }),
        canViewAnalytics ? api('/analytics') : Promise.resolve({}),
      ];
      const adminRequests = canManage
        ? [api('/users'), api('/settings'), api('/sms-logs'), api('/audit-logs'), api('/email-logs')]
        : [Promise.resolve({ users: [] }), Promise.resolve({ settings: [], rules: [] }), Promise.resolve({ logs: [] }), Promise.resolve({ logs: [] }), Promise.resolve({ logs: [] })];

      const secondary = await Promise.allSettled([...reviewRequests, ...adminRequests]);
      const [
        queueData,
        analyticsData,
        userData,
        settingsResponse,
        smsLogData,
        auditLogData,
        emailLogData,
      ] = secondary.map((result) => (result.status === 'fulfilled' ? result.value : null));

      setQueue(queueData?.queue || []);
      setAnalytics(analyticsData || {});
      setUsers(userData?.users || []);
      setSettingsData(settingsResponse || { settings: [], rules: [] });
      setSmsLogs(smsLogData?.logs || []);
      setAuditLogs(auditLogData?.logs || []);
      setEmailLogs(emailLogData?.logs || []);
      setDataReady(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setDataLoading(false);
    }
  }, [canManage, canReview, canUseQueue, canViewPatients, canViewReferrals, canViewCenters, canViewAnalytics, isPatient, patientFilters, referralFilters, role, session, user?.tracking_code]);

  useEffect(() => {
    function handlePopState() {
      setPublicPath(window.location.pathname);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigatePublic(path) {
    if (path.includes('#')) {
      const [pathname, hash] = path.split('#');
      window.history.pushState(null, '', pathname || '/');
      setPublicPath(pathname || '/');
      window.setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
      }, 0);
      return;
    }
    window.history.pushState(null, '', path);
    setPublicPath(path);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    const allowed = new Set(tabs.map((tab) => tab.id));
    if (!allowed.has(activeTab)) setActiveTab('dashboard');
  }, [activeTab, tabs]);

  useEffect(() => {
    function handleSessionExpired() {
      clearSession();
      setSession(null);
      setDataReady(false);
      setAuthView('login');
      setError('Your session expired. Please sign in again.');
    }

    window.addEventListener('carelink:session-expired', handleSessionExpired);
    return () => window.removeEventListener('carelink:session-expired', handleSessionExpired);
  }, []);

  function logout() {
    clearSession();
    setSession(null);
    setDataReady(false);
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
    if (publicPath === '/live-queue') {
      return <PublicQueueBoard onNavigate={navigatePublic} />;
    }
    return (
      <Landing
        onLogin={() => setAuthView('login')}
        initialTrackingCode={pathTrackingCode}
        onNavigate={navigatePublic}
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
          <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">
            {(user.permissions || permissionsForRole(role)).length} RBAC permissions
          </p>
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
          <OfflineBanner />
          <LoadingOverlay open={dataLoading} label="Loading records from database" />
          {error ? <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
          {!dataReady && !error ? (
            <div className="flex min-h-[50vh] items-center justify-center rounded-3xl border border-slate-200 bg-white">
              <p className="text-sm font-medium text-slate-500">Fetching live data from Supabase…</p>
            </div>
          ) : null}
          {dataReady && activeTab === 'dashboard' && isPatient ? (
            <PatientHome key="patient-home" user={user} tracking={patientTracking || summary.tracking} />
          ) : null}
          {dataReady && activeTab === 'dashboard' && !isPatient ? (
            <Dashboard key="dashboard" summary={summary} canUseAi={can(PERMISSIONS.DASHBOARD_AI)} />
          ) : null}
          {dataReady && activeTab === 'patients' && canCreatePatients ? (
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
          {dataReady && activeTab === 'referrals' && (canCreateReferrals || canReview) ? (
            <Referrals
              key="referrals"
              patients={patients}
              healthCenters={healthCenters}
              referrals={referrals}
              filters={referralFilters}
              setFilters={setReferralFilters}
              canReview={canReview}
              canCreate={canCreateReferrals}
              user={user}
              onRefresh={loadData}
            />
          ) : null}
          {dataReady && activeTab === 'queue' && canUseQueue ? <Queue key="queue" user={user} onRefresh={loadData} /> : null}
          {dataReady && activeTab === 'analytics' && canViewAnalytics ? <Analytics key="analytics" analytics={analytics} /> : null}
          {dataReady && activeTab === 'tracking' && canTrack ? (
            <Tracking key="tracking" initialCode={user?.tracking_code || pathTrackingCode} />
          ) : null}
          {dataReady && activeTab === 'profile' && can(PERMISSIONS.PROFILE_VIEW) ? <Profile key="profile" session={session} onSessionUpdate={setSession} /> : null}
          {dataReady && activeTab.startsWith('admin-') && canManage ? (
            <Admin
              key={activeTab}
              section={activeTab.replace('admin-', '')}
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
