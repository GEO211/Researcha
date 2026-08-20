import { useRef } from 'react';
import {
  AnimatePresence,
  motion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import {
  Activity,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Search,
  Shield,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CountUp,
  MotionItem,
  MotionStagger,
  PrimaryButton,
  StatusBadge,
  TextInput,
  easeOut,
  popUp,
} from '@/components/ui';

const MotionDiv = motion.div;

const highlights = [
  {
    icon: Activity,
    title: 'Real-time referral and queue status',
    description: 'See where your referral stands — from submission to city review and queue placement.',
    accent: 'from-cyan-500 to-teal-400',
    tint: 'from-cyan-500/10 to-teal-500/5',
  },
  {
    icon: CalendarClock,
    title: 'Appointment schedule visibility',
    description: 'View confirmed appointment times and queue numbers as soon as they are assigned.',
    accent: 'from-blue-500 to-cyan-400',
    tint: 'from-blue-500/10 to-cyan-500/5',
  },
  {
    icon: Clock3,
    title: 'Available 24/7 for patients and families',
    description: 'Check status any time, day or night — no staff login or account needed.',
    accent: 'from-emerald-500 to-teal-400',
    tint: 'from-emerald-500/10 to-teal-500/5',
    showCount: true,
  },
];

const progressSteps = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'queued', label: 'Queued' },
  { key: 'appointment', label: 'Appointment set' },
  { key: 'complete', label: 'Completed' },
];

function statusProgress(status) {
  switch (status) {
    case 'pending_review':
    case 'submitted':
      return 1;
    case 'under_review':
      return 2;
    case 'queued':
    case 'approved':
      return 3;
    case 'completed':
      return 4;
    case 'expired':
    case 'rejected':
    case 'cancelled':
    case 'archived':
    case 'invalid_queue':
      return 2;
    default:
      return 1;
  }
}

function trackingStatusBannerClass(result) {
  if (result.is_cancelled) return 'border-slate-200 bg-slate-100 text-slate-800';
  if (result.is_expired) return 'border-amber-100 bg-amber-50 text-amber-900';
  if (result.display_status === 'rejected' || result.status === 'rejected') {
    return 'border-red-100 bg-red-50 text-red-800';
  }
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function trackingQueueLabel(result) {
  return result.queue_number || (result.is_expired ? 'Queue expired' : 'Not assigned');
}

function MeshOrb({ className, color, size = 400 }) {
  return (
    <MotionDiv
      animate={{ x: [0, 20, -15, 0], y: [0, -18, 12, 0], scale: [1, 1.06, 0.97, 1] }}
      transition={{ duration: 16, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
      className={cn('pointer-events-none absolute rounded-full blur-3xl opacity-60', className)}
      style={{ width: size, height: size }}
    >
      <div className={cn('h-full w-full rounded-full', color)} />
    </MotionDiv>
  );
}

function TrackingProgress({ status, result }) {
  const current = statusProgress(status);
  const isTerminal = ['rejected', 'cancelled', 'invalid_queue', 'expired', 'archived'].includes(status);
  const fillPercent = `${((current - 1) / (progressSteps.length - 1)) * 100}%`;

  const terminalMessage = result?.status_message
    ? null
    : result?.is_cancelled || status === 'cancelled' || status === 'archived'
      ? 'This referral was cancelled.'
      : result?.is_expired || status === 'expired'
        ? 'This queue has expired.'
        : status === 'rejected'
          ? 'This referral was rejected.'
          : isTerminal
            ? 'This referral needs follow-up. Contact your health center for assistance.'
            : null;

  const terminalClass = result?.is_cancelled || status === 'cancelled' || status === 'archived'
    ? 'border-slate-200 bg-slate-100/80 text-slate-800'
    : result?.is_expired || status === 'expired'
      ? 'border-amber-100 bg-amber-50/80 text-amber-800'
      : status === 'rejected'
        ? 'border-red-100 bg-red-50/80 text-red-800'
        : 'border-amber-100 bg-amber-50/80 text-amber-800';

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
        Referral progress
      </p>
      <div className="relative">
        <div className="absolute left-[14px] right-[14px] top-[14px] h-0.5 bg-slate-200" />
        <MotionDiv
          initial={{ width: 0 }}
          animate={{ width: fillPercent }}
          transition={{ duration: 0.9, ease: easeOut, delay: 0.2 }}
          className="absolute left-[14px] top-[14px] h-0.5 max-w-[calc(100%-28px)] bg-gradient-to-r from-cyan-500 to-teal-500"
        />
        <div className="relative flex items-start justify-between gap-1">
          {progressSteps.map((step, index) => {
            const stepNumber = index + 1;
            const isActive = stepNumber <= current;
            const isCurrent = stepNumber === current;

            return (
              <div key={step.key} className="flex flex-1 flex-col items-center gap-2">
                <MotionDiv
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15 + index * 0.1, duration: 0.45, ease: easeOut }}
                  className={cn(
                    'relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors',
                    isActive
                      ? isCurrent
                        ? 'border-cyan-600 bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                        : 'border-cyan-600 bg-cyan-50 text-cyan-700'
                      : 'border-slate-200 bg-white text-slate-400',
                  )}
                >
                  {isActive && stepNumber < current ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    stepNumber
                  )}
                  {isCurrent ? (
                    <span className="absolute inset-0 animate-ping rounded-full border border-cyan-400/40" />
                  ) : null}
                </MotionDiv>
                <span
                  className={cn(
                    'text-center text-[10px] font-medium leading-tight',
                    isActive ? 'text-slate-700' : 'text-slate-400',
                  )}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {terminalMessage ? (
        <MotionDiv
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn('mt-4 rounded-xl border px-3 py-2 text-center text-xs', terminalClass)}
        >
          {terminalMessage}
        </MotionDiv>
      ) : null}
    </div>
  );
}

function CinematicHighlight({ item, index }) {
  const Icon = item.icon;

  return (
    <MotionDiv
      initial={{ opacity: 0, x: -32 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.65, delay: index * 0.12, ease: easeOut }}
      className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm backdrop-blur-sm transition duration-300 hover:border-cyan-200/80 hover:shadow-md hover:shadow-cyan-900/5"
    >
      <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100', item.tint)} />
      <div className="relative flex gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white shadow-sm">
          <Icon className="h-4 w-4 text-cyan-700" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {item.showCount ? (
              <>
                Available{' '}
                <span className="tabular-nums text-cyan-700">
                  <CountUp to={24} duration={1.2} />
                  /
                  <CountUp to={7} delay={0.1} duration={1} />
                </span>{' '}
                for patients and families
              </>
            ) : (
              item.title
            )}
          </p>
          <p className="mt-1 text-sm leading-snug text-slate-500">{item.description}</p>
        </div>
        <div className={cn('absolute bottom-0 left-0 h-0.5 w-0 bg-gradient-to-r transition-all duration-500 group-hover:w-full', item.accent)} />
      </div>
    </MotionDiv>
  );
}

export function PublicTrackingPanel({
  code,
  setCode,
  tracking,
  trackError,
  trackResult,
  onLookup,
  compact = false,
  title = 'Track referral',
  subtitle = 'Yours or someone else\'s — code from SMS or slip',
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.65rem] border border-white/70 bg-white/80 shadow-[0_24px_64px_rgba(14,116,144,0.1)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-slate-900/[0.03] to-transparent" />

      <div className="relative border-b border-slate-100/80 px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-cyan-600 to-teal-600 p-2.5 text-white shadow-lg shadow-cyan-600/25">
              <HeartPulse className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{title}</p>
              <p className="text-[11px] text-slate-500">{subtitle}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        </div>
      </div>

      <div className="relative px-4 py-4 sm:px-5 sm:py-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onLookup(code);
          }}
          className="relative"
        >
          <div className="relative flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl">
              {!trackResult && !tracking ? (
                <MotionDiv
                  aria-hidden
                  animate={{ x: ['-120%', '220%'] }}
                  transition={{ duration: 2.8, repeat: Number.POSITIVE_INFINITY, ease: 'linear', repeatDelay: 1.2 }}
                  className="pointer-events-none absolute inset-y-0 z-10 w-1/2 bg-gradient-to-r from-transparent via-cyan-400/15 to-transparent"
                />
              ) : null}
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-20 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <TextInput
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="e.g. CL-2026-XXXX"
                required
                className="relative border-slate-200/80 bg-white/90 py-2.5 pl-10 text-sm shadow-inner"
              />
            </div>
            <PrimaryButton
              disabled={tracking}
              className="shrink-0 bg-gradient-to-r from-cyan-600 to-teal-600 px-5 py-2.5 text-sm shadow-md shadow-cyan-600/20 hover:from-cyan-700 hover:to-teal-700"
            >
              {tracking ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ...
                </span>
              ) : (
                'Track'
              )}
            </PrimaryButton>
          </div>
        </form>

        <p className="mt-2.5 text-[11px] leading-snug text-slate-500">
          Enter any valid tracking code — family members can check on behalf of a patient.
        </p>

        <AnimatePresence mode="wait">
          {trackError ? (
            <MotionDiv
              key="track-error"
              initial={{ opacity: 0, scale: 0.96, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
              transition={{ duration: 0.35, ease: easeOut }}
              className="mt-3 rounded-xl border border-red-100 bg-red-50/90 p-3 text-xs text-red-700"
            >
              {trackError}
            </MotionDiv>
          ) : null}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {trackResult ? (
            <MotionDiv
              key={trackResult.tracking_code}
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.45, ease: easeOut }}
              className={cn('mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md', compact && 'max-h-[28rem] overflow-y-auto')}
            >
              <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-r from-cyan-50/90 via-white to-teal-50/50 px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-mono text-sm font-bold tracking-tight text-slate-950">
                    {trackResult.tracking_code}
                  </h3>
                  <StatusBadge value={trackResult.display_status || trackResult.status} />
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Sparkles className="h-3 w-3 text-cyan-600" />
                  {trackResult.status_subtitle || 'Referral found'}
                </p>
              </div>

              {trackResult.status_message ? (
                <div className={cn('border-b px-4 py-2.5 text-xs', trackingStatusBannerClass(trackResult))}>
                  {trackResult.status_message}
                </div>
              ) : null}

              <MotionStagger
                className={cn('grid gap-2 p-3', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}
                stagger={0.06}
                delayChildren={0.15}
              >
                {[
                  { icon: HeartPulse, label: 'Patient', value: trackResult.patient_name },
                  { icon: Shield, label: 'Receiving center', value: trackResult.receiving_center_name },
                  {
                    icon: CalendarClock,
                    label: 'Appointment',
                    value: trackResult.appointment_time
                      ? new Date(trackResult.appointment_time).toLocaleString()
                      : 'Not scheduled',
                  },
                  {
                    icon: Bell,
                    label: 'Queue number',
                    value: trackingQueueLabel(trackResult),
                  },
                  {
                    icon: Activity,
                    label: 'Queue position',
                    value: trackResult.queue_position ? `#${trackResult.queue_position} in line` : 'Not in active queue',
                  },
                  {
                    icon: Shield,
                    label: 'Priority',
                    value: trackResult.priority_level
                      ? String(trackResult.priority_level).replaceAll('_', ' ')
                      : 'Not assigned',
                  },
                ].map((row) => {
                  const DetailIcon = row.icon;
                  return (
                    <MotionItem key={row.label} variant={popUp}>
                      <div className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-2.5">
                        <div className="rounded-lg bg-white p-1.5 text-cyan-700 shadow-sm ring-1 ring-slate-200/60">
                          <DetailIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{row.label}</p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-900">{row.value}</p>
                        </div>
                      </div>
                    </MotionItem>
                  );
                })}
              </MotionStagger>

              <div className="px-3 pb-3">
                <TrackingProgress
                  status={trackResult.display_status || trackResult.status}
                  result={trackResult}
                />
              </div>
            </MotionDiv>
          ) : (
            <MotionDiv
              key="track-placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-4"
            >
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Preview</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Status', icon: Activity },
                  { label: 'Queue', icon: Bell },
                  { label: 'Appt', icon: CalendarClock },
                ].map((item, index) => {
                  const PlaceholderIcon = item.icon;
                  return (
                    <MotionDiv
                      key={item.label}
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{
                        duration: 2.2,
                        repeat: Number.POSITIVE_INFINITY,
                        delay: index * 0.25,
                        ease: 'easeInOut',
                      }}
                      className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-2 py-2.5 text-center"
                    >
                      <PlaceholderIcon className="mx-auto h-3.5 w-3.5 text-slate-300" />
                      <p className="mt-1 text-[10px] font-medium text-slate-400">{item.label}</p>
                    </MotionDiv>
                  );
                })}
              </div>
            </MotionDiv>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function PublicTrackingSection({
  code,
  setCode,
  tracking,
  trackError,
  trackResult,
  onLookup,
}) {
  const sectionRef = useRef(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, { stiffness: 80, damping: 26 });
  const panelY = useTransform(smoothProgress, [0, 0.5, 1], [48, 0, -24]);
  const panelOpacity = useTransform(smoothProgress, [0, 0.25, 0.75, 1], [0.6, 1, 1, 0.85]);
  const headlineY = useTransform(smoothProgress, [0, 0.4], [32, 0]);

  return (
    <section
      id="track"
      ref={sectionRef}
      className="relative min-h-[100svh] overflow-hidden border-t border-slate-200/80 bg-[#f8fafc]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_20%_20%,rgba(6,182,212,0.12),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_90%_80%,rgba(20,184,166,0.1),transparent_50%)]" />

      <MeshOrb
        size={480}
        color="bg-gradient-to-br from-cyan-400/25 to-teal-300/15"
        className="-left-40 top-20"
      />
      <MeshOrb
        size={360}
        color="bg-gradient-to-br from-blue-400/20 to-cyan-300/10"
        className="-right-32 bottom-16"
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(14,116,144,0.12) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/80 to-transparent" />

      <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start lg:gap-12 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,440px)] xl:gap-16">
          <div className="flex flex-col justify-center">
            <MotionDiv
              style={{ y: headlineY }}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, ease: easeOut }}
            >
              <div className="inline-flex items-center gap-2.5 rounded-full border border-cyan-200/60 bg-white/70 px-4 py-2 shadow-sm backdrop-blur-xl">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 text-white">
                  <Shield className="h-3 w-3" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-600">
                  Public tracking
                </span>
              </div>

              <h2 className="mt-5 text-[clamp(1.75rem,3vw+0.75rem,2.75rem)] font-extrabold leading-[1.1] tracking-[-0.02em] text-slate-950">
                Check your referral status{' '}
                <span className="bg-gradient-to-r from-cyan-600 via-teal-500 to-emerald-500 bg-clip-text text-transparent">
                  anytime
                </span>
              </h2>

              <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-500">
                Enter the tracking code you received when your referral was submitted.{' '}
                <span className="font-medium text-slate-700">No account required.</span>
              </p>
            </MotionDiv>

            <div className="mt-8 space-y-3">
              {highlights.map((item, index) => (
                <CinematicHighlight key={item.title} item={item} index={index} />
              ))}
            </div>
          </div>

          <MotionDiv
            style={{ y: panelY, opacity: panelOpacity }}
            className="lg:sticky lg:top-[calc(var(--header-height,4.5rem)+1.5rem)] lg:self-start"
          >
            <div className="pointer-events-none absolute -inset-1 rounded-[1.85rem] bg-gradient-to-br from-cyan-400/30 via-white/10 to-teal-400/25 blur-md" />
            <PublicTrackingPanel
              code={code}
              setCode={setCode}
              tracking={tracking}
              trackError={trackError}
              trackResult={trackResult}
              onLookup={onLookup}
              title="Track your referral"
              subtitle="Code from SMS or referral slip"
            />
          </MotionDiv>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-50 to-transparent" />
    </section>
  );
}
