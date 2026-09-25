import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  Bell,
  ClipboardList,
  HeartPulse,
  LineChart,
  Shield,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '../api';
import {
  GlowCard,
  HowItWorks,
  Logos3,
  PublicTrackingSection,
  CareLinkHero,
  CinematicEyebrow,
  CinematicEnter,
  CinematicWords,
  cinematicEase,
  useHeroReplayKey,
  MotionItem,
  MotionReveal,
  CinematicFooter,
  CountUp,
  MotionStagger,
  PrimaryButton,
  SoftwareUsed,
  StatusBadge,
  WebDevelopers,
  popUp,
} from '@/components/ui';

const MotionDiv = motion.div;

const features = [
  {
    icon: ClipboardList,
    title: 'Smart Referrals',
    description: 'Submit referrals from barangay health centers with clinical urgency and automatic priority scoring.',
    glowColor: 'blue',
    image: '/images/smart-referrals.jpg',
  },
  {
    icon: Users,
    title: 'Patient Registry',
    description: 'Register and search patients by name, city, contact, and health center with complete address records.',
    glowColor: 'purple',
    image: '/images/patient-registry.jpg',
  },
  {
    icon: Bell,
    title: 'Priority Queue',
    description: 'Automatically queue patients by vulnerability and urgency so city staff can serve the right cases first.',
    glowColor: 'green',
    image: '/images/priority-queue.jpg',
  },
  {
    icon: Activity,
    title: 'SMS & Email Alerts',
    description: 'Notify patients on referral updates and send appointment reminders 30 minutes ahead of schedule.',
    glowColor: 'orange',
    image: '/images/sms-email-alerts.jpg',
  },
  {
    icon: LineChart,
    title: 'Analytics Dashboard',
    description: 'Monitor referral trends, queue performance, demographics, and export reports for decision-making.',
    glowColor: 'blue',
    image: '/images/analytics-dashboard.jpg',
  },
  {
    icon: Shield,
    title: 'Secure & Audited',
    description: 'Role-based access for barangay staff, city staff, and admins with full audit trail logging.',
    glowColor: 'red',
    image: '/images/secure-audited.jpg',
  },
];

const previewItems = [
  { label: 'New referral submitted', detail: 'Barangay General Santos Heights', status: 'queued', accent: 'from-cyan-500 to-teal-400' },
  { label: 'Priority 1 patient called', detail: 'City Health Center Main', status: 'called', accent: 'from-teal-500 to-emerald-400' },
  { label: 'Appointment reminder sent', detail: 'SMS + email notification', status: 'notified', accent: 'from-blue-500 to-cyan-400', compact: true },
];

function LivePreviewAside() {
  const replayKey = useHeroReplayKey();

  return (
    <div className="relative flex h-full max-h-full flex-col overflow-hidden rounded-[1.5rem] border border-white/60 bg-white/70 p-4 shadow-[0_24px_64px_rgba(14,116,144,0.12)] backdrop-blur-2xl sm:rounded-[1.65rem] sm:p-5 lg:p-6">
      <MotionDiv
        key={`shine-${replayKey}`}
        initial={{ x: '-120%', opacity: 0 }}
        animate={{ x: '220%', opacity: [0, 0.55, 0] }}
        transition={{ duration: 1.5, delay: 0.15, ease: 'easeInOut' }}
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
      />
      <div className="relative mb-3 flex shrink-0 items-center justify-between gap-3 sm:mb-4">
        <div className="min-w-0">
          <CinematicEyebrow
            text="Live preview"
            delay={0.15}
            className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 sm:text-xs sm:tracking-[0.18em]"
          />
          <MotionDiv
            key={`line-${replayKey}`}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.75, delay: 0.28, ease: cinematicEase }}
            className="mt-1 h-px w-10 origin-left bg-gradient-to-r from-cyan-500/70 to-transparent"
          />
          <p className="mt-1 truncate text-sm font-semibold text-slate-800">
            <CinematicWords text="Workflow activity" delay={0.32} />
          </p>
        </div>
        <MotionDiv
          key={`active-${replayKey}`}
          initial={{ opacity: 0, scale: 0.82, filter: 'blur(8px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.75, delay: 0.48, ease: cinematicEase }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 sm:px-3 sm:text-xs"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Active
        </MotionDiv>
      </div>
      <MotionStagger
        key={`list-${replayKey}`}
        className="min-h-0 flex-1 space-y-2 overflow-hidden sm:space-y-2.5"
        stagger={0.1}
        delayChildren={0.58}
        replay
      >
        {previewItems.map((item) => (
          <MotionItem key={item.label} variant={popUp}>
            <div className={cn(
              'group flex items-center justify-between gap-2 rounded-xl border border-slate-100/80 bg-slate-50/80 p-3 transition duration-300 hover:border-cyan-200/60 hover:bg-white sm:gap-3 sm:rounded-2xl sm:p-3.5',
              item.compact && 'max-lg:hidden',
            )}>
              <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
                <div className={cn('mt-0.5 h-7 w-1 shrink-0 rounded-full bg-gradient-to-b sm:mt-1 sm:h-8', item.accent)} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{item.label}</p>
                  <p className="truncate text-[11px] text-slate-500 sm:text-xs">{item.detail}</p>
                </div>
              </div>
              <StatusBadge value={item.status} />
            </div>
          </MotionItem>
        ))}
      </MotionStagger>
      <CinematicEnter
        delay={0.95}
        className="mt-3 hidden shrink-0 overflow-hidden rounded-xl border border-cyan-100/80 bg-gradient-to-br from-cyan-50/90 to-teal-50/50 p-3 sm:mt-4 sm:rounded-2xl sm:p-4 lg:block"
      >
        <div className="flex items-start gap-3">
          <MotionDiv
            key={`shield-${replayKey}`}
            initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.65, delay: 1.05, ease: cinematicEase }}
            className="rounded-xl bg-white/80 p-2 shadow-sm"
          >
            <Shield className="h-4 w-4 text-cyan-700" />
          </MotionDiv>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              <CinematicWords text="Built for local health operations" delay={1.08} />
            </p>
            <MotionDiv
              key={`desc-${replayKey}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 1.25, ease: cinematicEase }}
            >
              <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
                Barangay registration, city review, queue management, and public tracking — unified in one platform.
              </p>
            </MotionDiv>
          </div>
        </div>
      </CinematicEnter>
    </div>
  );
}

export default function Landing({ onLogin, initialTrackingCode = '', onNavigate }) {
  const [code, setCode] = useState(initialTrackingCode);
  const [trackResult, setTrackResult] = useState(null);
  const [trackError, setTrackError] = useState('');
  const [tracking, setTracking] = useState(false);

  const lookup = useCallback(async (codeToLookup) => {
    if (!codeToLookup.trim()) return;
    setTracking(true);
    setTrackError('');
    setTrackResult(null);
    try {
      const data = await api(`/public/track/${codeToLookup.trim()}`);
      setTrackResult(data);
      window.history.replaceState(null, '', `/track/${codeToLookup.trim()}`);
    } catch (err) {
      setTrackError(err.message);
    } finally {
      setTracking(false);
    }
  }, []);

  useEffect(() => {
    if (initialTrackingCode) {
      setTimeout(() => lookup(initialTrackingCode), 0);
    }
  }, [initialTrackingCode, lookup]);

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900"
      style={{ '--header-height': '4.5rem' }}
    >
      <MotionDiv
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-30 h-[var(--header-height)] border-b border-slate-200/80 bg-white/90 backdrop-blur"
      >
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-3">
            <div className="rounded-2xl bg-cyan-700 p-2 text-white shadow-lg shadow-cyan-900/20">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold tracking-tight">CareLink</p>
              <p className="text-xs text-slate-500">Smart Health Referral System</p>
            </div>
          </button>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <button type="button" onClick={() => scrollTo('features')} className="transition hover:text-cyan-700">Features</button>
            <button type="button" onClick={() => scrollTo('how-it-works')} className="transition hover:text-cyan-700">How it works</button>
            <button type="button" onClick={() => scrollTo('track')} className="transition hover:text-cyan-700">Track referral</button>
            <button
              type="button"
              onClick={() => (onNavigate ? onNavigate('/live-queue') : (window.location.href = '/live-queue'))}
              className="transition hover:text-cyan-700"
            >
              Live queue
            </button>
          </nav>
          <PrimaryButton onClick={onLogin}>Staff login</PrimaryButton>
        </div>
      </MotionDiv>

      <CareLinkHero
        badge="Koronadal City Health"
        title1="Connecting barangay care"
        title2="to city health services"
        description="CareLink streamlines patient referrals, priority queuing, appointment reminders, and real-time tracking — so patients get faster, fairer access to care."
        onScrollHint={() => scrollTo('how-it-works')}
        aside={<LivePreviewAside />}
      >
        <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:mt-5 sm:gap-3 lg:mt-6">
          <MotionDiv whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <PrimaryButton
              onClick={onLogin}
              className="group relative overflow-hidden bg-gradient-to-r from-cyan-600 to-teal-600 px-5 py-2.5 text-sm shadow-lg shadow-cyan-600/25 hover:from-cyan-700 hover:to-teal-700 sm:px-7 sm:py-3 sm:text-base"
            >
              <span className="relative z-10 flex items-center gap-2">
                Get started
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </PrimaryButton>
          </MotionDiv>
          <MotionDiv whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <button
              type="button"
              onClick={() => scrollTo('track')}
              className="rounded-xl border border-slate-200/80 bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-xl transition hover:border-cyan-300 hover:bg-white hover:text-cyan-800 hover:shadow-md sm:px-7 sm:py-3"
            >
              Track my referral
            </button>
          </MotionDiv>
        </div>
        <MotionStagger className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3 lg:mt-6" stagger={0.08}>
          {[
            { label: 'Tracking access', value: (delay) => (
              <span className="tabular-nums">
                <CountUp to={24} delay={delay} duration={1.5} />
                /
                <CountUp to={7} delay={delay + 0.12} duration={1.2} />
              </span>
            ) },
            { label: 'Queue priority', value: () => <span>Auto</span> },
            { label: 'Appointment alerts', value: (delay) => (
              <CountUp to={30} suffix=" min" delay={delay} duration={2} className="tabular-nums" />
            ) },
          ].map((stat, index) => (
            <MotionItem key={stat.label} variant={popUp}>
              <div className="group rounded-xl border border-white/80 bg-white/60 p-2.5 shadow-sm backdrop-blur-xl transition duration-300 hover:border-cyan-200/60 hover:bg-white/90 hover:shadow-md sm:rounded-2xl sm:p-3.5 lg:hover:-translate-y-1">
                <p className="bg-gradient-to-r from-cyan-700 to-teal-600 bg-clip-text text-lg font-bold text-transparent sm:text-xl lg:text-2xl">{stat.value(index * 0.15)}</p>
                <p className="mt-0.5 text-[9px] font-medium uppercase leading-tight tracking-wide text-slate-500 sm:mt-1 sm:text-[10px] lg:text-[11px]">{stat.label}</p>
              </div>
            </MotionItem>
          ))}
        </MotionStagger>
      </CareLinkHero>

      <HowItWorks />

      <PublicTrackingSection
        code={code}
        setCode={setCode}
        tracking={tracking}
        trackError={trackError}
        trackResult={trackResult}
        onLookup={lookup}
      />

      <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <MotionReveal className="mb-14" variant={popUp}>
          <Logos3
            variant="embedded"
            heading="Trusted by local health partners"
          />
        </MotionReveal>
        <MotionReveal className="mb-10 max-w-2xl" variant={popUp}>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Features</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Everything your referral workflow needs</h2>
          <p className="mt-3 text-slate-600">From patient intake to analytics, CareLink keeps health staff aligned and patients informed.</p>
        </MotionReveal>
        <MotionStagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" stagger={0.1}>
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <MotionItem key={feature.title} variant={popUp}>
                <GlowCard
                  glowColor={feature.glowColor}
                  customSize
                  className="h-full w-full shadow-md shadow-slate-200/60"
                >
                  <div className="relative mb-4 overflow-hidden rounded-xl">
                    <img
                      src={feature.image}
                      alt={feature.title}
                      className="h-32 w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent" />
                    <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
                      <Icon className="h-4 w-4 text-cyan-700" />
                      <span className="text-sm font-semibold text-slate-900">{feature.title}</span>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-600">{feature.description}</p>
                </GlowCard>
              </MotionItem>
            );
          })}
        </MotionStagger>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6">
        <MotionReveal variant={popUp}>
          <div className="rounded-3xl bg-gradient-to-r from-cyan-700 to-cyan-900 px-6 py-10 text-white shadow-xl shadow-cyan-900/20 sm:px-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to manage referrals smarter?</h2>
                <p className="mt-2 max-w-xl text-cyan-100">
                  Sign in as barangay staff, city staff, or administrator to access your CareLink workspace.
                </p>
              </div>
              <MotionDiv
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
              >
                <button
                  type="button"
                  onClick={onLogin}
                  className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-cyan-800 shadow-sm transition hover:bg-cyan-50"
                >
                  Staff login
                </button>
              </MotionDiv>
            </div>
          </div>
        </MotionReveal>
      </section>

      <WebDevelopers />

      <CinematicFooter
        onLogin={onLogin}
        onTrack={() => scrollTo('track')}
      />
    </div>
  );
}
