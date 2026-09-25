import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { classNames } from './helpers';
import { emitOfflineStatus, isBrowserOnline, pendingOfflineCount, readSyncMeta } from '../lib/offline';
import { flushOfflineNow } from '../api';

export function OfflineBanner() {
  const [state, setState] = useState(() => ({
    online: isBrowserOnline(),
    pending: pendingOfflineCount(),
    lastSyncAt: readSyncMeta().lastSyncAt || null,
    lastError: readSyncMeta().lastError || null,
  }));
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    function handleStatus(event) {
      setState(event.detail);
    }
    function handleBrowser() {
      emitOfflineStatus();
      if (navigator.onLine) {
        flushOfflineNow().catch(() => {});
      }
    }
    window.addEventListener('carelink:offline-status', handleStatus);
    window.addEventListener('online', handleBrowser);
    window.addEventListener('offline', handleBrowser);
    emitOfflineStatus();
    return () => {
      window.removeEventListener('carelink:offline-status', handleStatus);
      window.removeEventListener('online', handleBrowser);
      window.removeEventListener('offline', handleBrowser);
    };
  }, []);

  async function syncNow() {
    setSyncing(true);
    try {
      await flushOfflineNow();
    } finally {
      setSyncing(false);
    }
  }

  if (state.online && !state.pending && !state.lastError) return null;

  return (
    <div
      className={classNames(
        'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm',
        state.online
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-slate-300 bg-slate-900 text-white',
      )}
    >
      <div className="flex items-start gap-3">
        {state.online ? <Wifi className="mt-0.5 h-4 w-4 shrink-0" /> : <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />}
        <div>
          <p className="font-semibold">
            {state.online ? 'Back online' : 'Offline mode'}
          </p>
          <p className={classNames('text-xs', state.online ? 'text-amber-800' : 'text-slate-300')}>
            {state.online
              ? (state.pending
                ? `${state.pending} saved ${state.pending === 1 ? 'change is' : 'changes are'} waiting to sync to the database.`
                : (state.lastError || 'Cached records are available while reconnecting.'))
              : 'You can still view cached records and save patient/referral entries. They will sync when internet is restored.'}
          </p>
        </div>
      </div>
      {state.online && state.pending ? (
        <button
          type="button"
          onClick={syncNow}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-amber-900 shadow-sm"
        >
          <RefreshCw className={classNames('h-3.5 w-3.5', syncing && 'animate-spin')} />
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      ) : null}
    </div>
  );
}
