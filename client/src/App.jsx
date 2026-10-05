import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, Menu } from 'lucide-react';
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
import PatientHistory from './pages/PatientHistory';
import Patients from './pages/Patients';
import Profile from './pages/Profile';
import Queue from './pages/Queue';
import Referrals from './pages/Referrals';
import Tracking from './pages/Tracking';
import { PERMISSIONS, hasPermission, navigationForRole } from '@shared/rbac';
import { phMobileDigits } from './lib/patientValidation';

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
  const [smsLogs, setSmsLogs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [referralFilters, setReferralFilters] = useState({ q: '', status: '', priority_level: '' });
  const [emailLogs, setEmailLogs] = useState([]);
  const [patientFilters, setPatientFilters] = useState({ q: '', city: '', province: '', contact_number: '', email: '', health_center_id: '' });
  const [patientTracking, setPatientTracking] = useState(null);
  const [trackCode, setTrackCode] = useState(pathTrackingCode);
  const [error, setError] = useState('');
  const [dataLoading, setDataLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = window.localStorage.getItem('carelink.sidebar');
    if (stored === 'closed') return false;
    if (stored === 'open') return true;
    return window.innerWidth >= 1024;
  });
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
    if (isPatient) {
      setDataReady(true);
      return;
    }
    setDataLoading(true);
    setError('');

    try {
      flushOfflineNow().catch(() => {});
      const referralQuery = new URLSearchParams(
        Object.fromEntries(Object.entries(referralFilters).filter(([, value]) => value)),
      ).toString();
      const patientQuery = new URLSearchParams(
        Object.fromEntries(Object.entries(patientFilters).flatMap(([key, value]) => {
          if (!value) return [];
          if (key !== 'contact_number') return [[key, value]];
          const digits = phMobileDigits(value);
          return digits ? [[key, `+${digits}`]] : [];
        })),
      ).toString();

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
        canViewReferrals ? api(`/referrals${referralQuery ? `?${referralQuery}` : ''}`) : Promise.resolve({ referrals: [] }),
      ];
      const adminRequests = canManage
        ? [api('/users'), api('/sms-logs'), api('/audit-logs'), api('/email-logs'), api('/patients?limit=1000&include_archived=1')]
        : [Promise.resolve({ users: [] }), Promise.resolve({ logs: [] }), Promise.resolve({ logs: [] }), Promise.resolve({ logs: [] }), Promise.resolve({ patients: [] })];

      const secondary = await Promise.allSettled([...reviewRequests, ...adminRequests]);
      const [
        queueData,
        analyticsData,
        referralSecondary,
        userData,
        smsLogData,
        auditLogData,
        emailLogData,
        adminPatientData,
      ] = secondary.map((result) => (result.status === 'fulfilled' ? result.value : null));

      setQueue(queueData?.queue || []);
      setAnalytics(analyticsData || {});
      if (canManage) setReferrals(referralSecondary?.referrals || []);
      setUsers(userData?.users || []);
      setSmsLogs(smsLogData?.logs || []);
      setAuditLogs(auditLogData?.logs || []);
      setEmailLogs(emailLogData?.logs || []);
      if (canManage) setPatients(adminPatientData?.patients || []);
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

  function setSidebar(open) {
    setSidebarOpen(open);
    window.localStorage.setItem('carelink.sidebar', open ? 'open' : 'closed');
  }

  function selectTab(tabId) {
    setActiveTab(tabId);
    if (window.innerWidth < 1024) setSidebar(false);
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

  const accountDetail = user.health_center_name
    || (roleLabel(user.role) === user.name ? 'System access' : roleLabel(user.role));

  const sidebar = (
    <aside className="flex h-full flex-col bg-white text-slate-900">
      <div className={classNames('flex items-center border-b border-slate-200', sidebarOpen ? 'gap-2 px-3 py-3' : 'justify-center px-2 py-3')}>
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
          onClick={() => setSidebar(!sidebarOpen)}
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          aria-expanded={sidebarOpen}
        >
          <Menu className="h-5 w-5" />
        </button>
        {sidebarOpen ? (
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight">CareLink</h1>
            <p className="truncate text-xs text-slate-500">Koronadal City Health</p>
          </div>
        ) : null}
      </div>

      <nav className={classNames('flex-1 space-y-1 overflow-y-auto py-3', sidebarOpen ? 'px-3' : 'px-2')}>
        {tabs.map((tab) => {
          const Icon = tabIcon(tab.id, role);
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              title={tab.label}
              aria-label={tab.label}
              className={classNames(
                'flex w-full items-center rounded-lg text-sm transition',
                sidebarOpen ? 'gap-3 px-3 py-2.5 text-left' : 'justify-center px-0 py-2.5',
                isActive
                  ? 'bg-slate-900 font-semibold text-white'
                  : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950',
              )}
            >
              <Icon className={classNames('h-4 w-4 shrink-0', isActive ? 'text-white' : 'text-slate-400')} />
              {sidebarOpen ? <span className="truncate">{tab.label}</span> : <span className="sr-only">{tab.label}</span>}
            </button>
          );
        })}
      </nav>

      {sidebarOpen ? <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {String(user.name || 'C').trim().charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-950">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{accountDetail}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div> : (
        <div className="border-t border-slate-200 p-2">
          <button
            type="button"
            onClick={logout}
            title="Log out"
            aria-label="Log out"
            className="flex w-full items-center justify-center rounded-lg py-2.5 text-slate-500 hover:bg-slate-50 hover:text-slate-950"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  );

  return (
    <main className="min-h-screen bg-slate-100">
      <div
        className={classNames(
          'fixed inset-y-0 left-0 z-30 border-r border-slate-200 bg-white transition-[width] duration-200',
          sidebarOpen ? 'w-64' : 'w-14',
        )}
      >
        {sidebar}
      </div>

      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-slate-950/30 lg:hidden"
          onClick={() => setSidebar(false)}
          aria-label="Close sidebar"
        />
      ) : null}

      <div className={classNames('transition-[padding] duration-200', sidebarOpen ? 'pl-64' : 'pl-14')}>
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">{tabLabel(activeTab, role)}</h2>
            <p className="hidden truncate text-sm text-slate-500 sm:block">
              {user.health_center_name || roleLabel(user.role)}
            </p>
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
            <PatientHome key="patient-home" user={user} onOpenHistory={() => selectTab('history')} />
          ) : null}
          {dataReady && activeTab === 'dashboard' && !isPatient ? (
            <Dashboard key="dashboard" summary={summary} canUseAi={can(PERMISSIONS.DASHBOARD_AI)} />
          ) : null}
          {dataReady && activeTab === 'history' && isPatient ? (
            <PatientHistory key="patient-history" />
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
              onOpenTracking={(code) => {
                setTrackCode(code);
                setActiveTab('tracking');
              }}
            />
          ) : null}
          {dataReady && activeTab === 'queue' && canUseQueue ? <Queue key="queue" user={user} onRefresh={loadData} /> : null}
          {dataReady && activeTab === 'analytics' && canViewAnalytics ? <Analytics key="analytics" analytics={analytics} /> : null}
          {dataReady && activeTab === 'tracking' && canTrack && !isPatient ? (
            <Tracking
              key={`tracking-${trackCode || user?.tracking_code || pathTrackingCode || 'blank'}`}
              initialCode={trackCode || user?.tracking_code || pathTrackingCode}
              referrals={referrals}
              user={user}
            />
          ) : null}
          {dataReady && activeTab === 'profile' && can(PERMISSIONS.PROFILE_VIEW) ? <Profile key="profile" session={session} onSessionUpdate={setSession} /> : null}
          {dataReady && activeTab.startsWith('admin-') && canManage ? (
            <Admin
              key={activeTab}
              section={activeTab.replace('admin-', '')}
              users={users}
              patients={patients}
              healthCenters={healthCenters}
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
