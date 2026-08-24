import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bell,
  HeartPulse,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '../api';
import { classNames, priorityLabel } from '../components/helpers';
import {
  CountUp,
  MotionItem,
  MotionReveal,
  MotionStagger,
  PrimaryButton,
  PublicAdSidebar,
  PublicTrackingPanel,
  StatusBadge,
  easeOut,
  popUp,
} from '../components/ui';

const MotionDiv = motion.div;

const REFRESH_MS = 30_000;

function MeshOrb({ className, color, size = 400 }) {
  return (
    <MotionDiv
      animate={{ x: [0, 18, -12, 0], y: [0, -14, 10, 0], scale: [1, 1.05, 0.98, 1] }}
      transition={{ duration: 18, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
      className={cn('pointer-events-none absolute rounded-full blur-3xl opacity-50', className)}
      style={{ width: size, height: size }}
    >
      <div className={cn('h-full w-full rounded-full', color)} />
    </MotionDiv>
  );
}

function QueueRowSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 shrink-0 rounded-2xl bg-slate-100" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-5 w-32 rounded-lg bg-slate-100" />
          <div className="h-3 w-48 rounded bg-slate-100" />
        </div>
        <div className="hidden h-8 w-16 rounded-lg bg-slate-100 sm:block" />
      </div>
    </div>
  );
}

function QueueEntryCard({ entry, index, total }) {
  const isFirst = entry.queue_position === 1;
  const isTopThree = entry.queue_position <= 3;

  return (
    <MotionDiv
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: easeOut }}
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition duration-300',
        isFirst
          ? 'border-cyan-200/90 shadow-md shadow-cyan-900/10 ring-1 ring-cyan-100'
          : 'border-slate-200/80 hover:border-cyan-200/60 hover:shadow-md',
      )}
    >
      {isFirst ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400" />
      ) : null}

      <div className="flex items-center gap-4">
        <div
          className={cn(
            'relative flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl font-bold tabular-nums shadow-inner',
            isFirst
              ? 'bg-gradient-to-br from-cyan-600 to-teal-600 text-white shadow-lg shadow-cyan-600/30'
              : isTopThree
                ? 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-100'
                : 'bg-slate-50 text-slate-700 ring-1 ring-slate-100',
          )}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">#</span>
          <span className="text-xl leading-none">{entry.queue_position}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-lg font-bold tracking-wide text-slate-950 sm:text-xl">
              {entry.anonymous_name}
            </p>
            {isFirst ? (
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-800">
                Next
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {entry.queue_status ? <StatusBadge value={entry.queue_status} /> : null}
            {entry.priority_level ? (
              <span className="text-xs font-medium text-slate-500">{priorityLabel(entry.priority_level)}</span>
            ) : null}
            {entry.checkup_location || entry.receiving_center_name ? (
              <span className="text-xs text-slate-500">{entry.checkup_location || entry.receiving_center_name}</span>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {entry.queue_position === 1
              ? 'First in line today'
              : `${entry.queue_position - 1} patient${entry.queue_position === 2 ? '' : 's'} ahead`}
            {total > 0 ? ` · ${total} waiting` : ''}
          </p>
        </div>

        <div className="hidden shrink-0 text-right sm:block">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Queue #</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-slate-800">{entry.queue_number || '—'}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 sm:hidden">
        <span className="font-mono text-xs text-slate-500">Queue {entry.queue_number || '—'}</span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isFirst ? 'bg-gradient-to-r from-cyan-500 to-teal-500' : 'bg-cyan-400/70',
          )}
          style={{ width: `${Math.max(12, ((total - entry.queue_position + 1) / total) * 100)}%` }}
        />
      </div>
    </MotionDiv>
  );
}

function readInitialTrackingCode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('code') || params.get('track') || '';
}

export default function PublicQueueBoard({ onNavigate }) {
  const [board, setBoard] = useState({ entries: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [code, setCode] = useState(readInitialTrackingCode);
  const [trackResult, setTrackResult] = useState(null);
  const [trackError, setTrackError] = useState('');
  const [tracking, setTracking] = useState(false);

  const loadBoard = useCallback(async (silent = false) => {
    if (!silent) setError('');
    try {
      const data = await api('/public/queue/active');
      setBoard(data);
    } catch (err) {
      if (!silent) {
        setError(err.message || 'Unable to load the live queue.');
        setBoard({ entries: [], total: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const lookup = useCallback(async (codeToLookup) => {
    const trimmed = codeToLookup.trim();
    if (!trimmed) return;

    setTracking(true);
    setTrackError('');
    setTrackResult(null);

    try {
      const data = await api(`/public/track/${trimmed}`);
      setTrackResult(data);
      const nextUrl = `/live-queue?code=${encodeURIComponent(trimmed)}`;
      window.history.replaceState(null, '', nextUrl);
    } catch (err) {
      setTrackError(err.message);
    } finally {
      setTracking(false);
    }
  }, []);

  useEffect(() => {
    loadBoard();
    const timer = window.setInterval(() => loadBoard(true), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadBoard]);

  useEffect(() => {
    const initial = readInitialTrackingCode();
    if (initial) {
      lookup(initial);
    }
  }, [lookup]);

  function goHome() {
    if (onNavigate) {
      onNavigate('/');
      return;
    }
    window.location.href = '/';
  }

  const entries = board.entries || [];
  const total = board.total ?? entries.length;

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-[#f8fafc]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_20%_10%,rgba(6,182,212,0.14),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_90%_90%,rgba(20,184,166,0.12),transparent_50%)]" />
      <MeshOrb size={420} color="bg-gradient-to-br from-cyan-400/20 to-teal-300/10" className="-left-32 top-24" />
      <MeshOrb size={320} color="bg-gradient-to-br from-blue-400/15 to-cyan-300/10" className="-right-24 bottom-32" />
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(14,116,144,0.1) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={goHome}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-cyan-200 hover:text-cyan-800"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-gradient-to-br from-cyan-600 to-teal-600 p-2 text-white shadow-md shadow-cyan-600/25">
              <HeartPulse className="h-4 w-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold leading-tight text-slate-900">Live queue</p>
              <p className="text-[10px] text-slate-500">Koronadal City Health</p>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => loadBoard()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200/80 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:opacity-60"
          >
            <RefreshCw className={classNames('h-3.5 w-3.5', loading ? 'animate-spin' : '')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 sm:pt-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
          <aside className="order-1 space-y-4 lg:sticky lg:top-[4.75rem] lg:order-2 lg:self-start">
            <PublicTrackingPanel
              compact
              code={code}
              setCode={setCode}
              tracking={tracking}
              trackError={trackError}
              trackResult={trackResult}
              onLookup={lookup}
              title="Track referral"
              subtitle="Yours or someone else's — any valid code"
            />
            <PublicAdSidebar />
          </aside>

          <div className="order-2 space-y-6 lg:order-1">
            <MotionReveal variant={popUp}>
              <div className="pointer-events-none absolute -inset-1 rounded-[1.75rem] bg-gradient-to-br from-cyan-400/25 via-transparent to-teal-400/20 blur-lg" />
              <div className="relative overflow-hidden rounded-[1.65rem] border border-white/80 bg-white/80 p-6 shadow-[0_24px_64px_rgba(14,116,144,0.1)] backdrop-blur-xl sm:p-8">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/60 bg-cyan-50/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-800">
                      <Shield className="h-3.5 w-3.5" />
                      Anonymous board
                    </div>
                    <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-[1.75rem]">
                      Who&apos;s in line{' '}
                      <span className="bg-gradient-to-r from-cyan-600 to-teal-500 bg-clip-text text-transparent">
                        right now
                      </span>
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      Names are masked for privacy — only the first and last letter show, like{' '}
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-sm font-semibold text-cyan-800">
                        g****v
                      </span>
                      . Use the sidebar to track your referral code, or match your queue number from SMS.
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-row items-center gap-4 sm:flex-col sm:items-stretch">
                    <div className="flex-1 rounded-2xl border border-slate-100 bg-slate-50/90 px-5 py-4 text-center sm:flex-none">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">In queue</p>
                      <p className="mt-1 text-4xl font-bold tabular-nums text-cyan-800">
                        <CountUp to={Number(total)} duration={0.9} />
                      </p>
                    </div>
                    <span className="inline-flex items-center justify-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      Live
                    </span>
                  </div>
                </div>

                {board.updated_at ? (
                  <p className="mt-5 flex items-center gap-2 text-xs text-slate-500">
                    <Bell className="h-3.5 w-3.5 text-slate-400" />
                    Updated {new Date(board.updated_at).toLocaleTimeString()} · refreshes every 30 seconds
                  </p>
                ) : null}
              </div>
            </MotionReveal>

            {error ? (
              <p className="rounded-xl border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-700">{error}</p>
            ) : null}

            <div>
              {loading && !entries.length ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((key) => (
                    <QueueRowSkeleton key={key} />
                  ))}
                </div>
              ) : !entries.length ? (
                <MotionReveal variant={popUp}>
                  <div className="rounded-[1.65rem] border border-dashed border-slate-200 bg-white/70 px-6 py-14 text-center backdrop-blur-sm">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50">
                      <Users className="h-8 w-8 text-slate-300" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-slate-800">The queue is empty</p>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
                      No active patients are waiting right now. Track a referral in the sidebar to check status.
                    </p>
                  </div>
                </MotionReveal>
              ) : (
                <MotionStagger className="space-y-3" stagger={0.06}>
                  {entries.map((entry, index) => (
                    <MotionItem key={`${entry.queue_number}-${entry.queue_position}`} variant={popUp}>
                      <QueueEntryCard entry={entry} index={index} total={total} />
                    </MotionItem>
                  ))}
                </MotionStagger>
              )}
            </div>

            <MotionReveal variant={popUp} delay={0.1}>
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3 backdrop-blur-sm">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
                <p className="text-xs leading-relaxed text-slate-500">
                  The live board never shows full names. Use tracking in the sidebar for your personal referral details.
                </p>
              </div>
            </MotionReveal>
          </div>
        </div>
      </main>
    </div>
  );
}
