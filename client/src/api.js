import { SITE_URL } from './config/site.js';
import {
  cachedPayload,
  canQueueOfflineWrite,
  enqueueOfflineWrite,
  flushOfflineQueue,
  isBrowserOnline,
  networkError,
  optimisticOfflineResponse,
  writeCache,
} from './lib/offline.js';

function resolveApiBase() {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

  if (import.meta.env.DEV) {
    return configured || '/api';
  }

  if (!configured || configured === '/api' || configured.startsWith('http://') || configured.startsWith('https://')) {
    return configured || '/api';
  }

  console.warn(
    `[CareLink] Unexpected VITE_API_BASE_URL="${configured}". Use /api (Vercel) or https://host/api. Site: ${SITE_URL}`,
  );
  return configured;
}

const API_BASE = resolveApiBase();

export function getStoredSession() {
  const raw = localStorage.getItem('carelink.session');
  return raw ? JSON.parse(raw) : null;
}

export function storeSession(session) {
  localStorage.setItem('carelink.session', JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem('carelink.session');
}

function cacheableGet(path) {
  return !path.startsWith('/auth/');
}

async function fetchApi(path, options = {}) {
  const session = getStoredSession();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && session?.token) {
      clearSession();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/track')) {
        window.dispatchEvent(new CustomEvent('carelink:session-expired'));
      }
    }

    const message = response.status === 405
      ? 'API returned 405. Redeploy with the Vercel api/ function and set server env vars in the Vercel dashboard.'
      : (data?.message || 'Request failed.');
    const error = new Error(message);
    error.status = response.status;
    error.issues = Array.isArray(data?.issues) ? data.issues : [];
    throw error;
  }

  return data;
}

export async function api(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const online = isBrowserOnline();

  if (method === 'GET') {
    try {
      if (!online) {
        const cached = cachedPayload(path);
        if (cached) return { ...cached, _offline: true, _fromCache: true };
        throw new Error('You are offline and this record is not saved on this device yet.');
      }
      const data = await fetchApi(path, options);
      if (cacheableGet(path)) writeCache(path, data);
      return data;
    } catch (error) {
      const cached = cachedPayload(path);
      if (cached && (networkError(error) || !online)) {
        return { ...cached, _offline: true, _fromCache: true };
      }
      throw error;
    }
  }

  if (!online || !isBrowserOnline()) {
    if (!canQueueOfflineWrite(method, path)) {
      throw new Error('This action needs an internet connection.');
    }
    const parsedBody = options.body ? JSON.parse(options.body) : {};
    const entry = enqueueOfflineWrite({ method, path, body: parsedBody });
    return optimisticOfflineResponse(entry);
  }

  try {
    return await fetchApi(path, options);
  } catch (error) {
    if (networkError(error) && canQueueOfflineWrite(method, path)) {
      const parsedBody = options.body ? JSON.parse(options.body) : {};
      const entry = enqueueOfflineWrite({ method, path, body: parsedBody });
      return optimisticOfflineResponse(entry);
    }
    throw error;
  }
}

export async function flushOfflineNow() {
  if (!isBrowserOnline()) return { flushed: 0, remaining: pendingHint() };
  return flushOfflineQueue((path, options) => fetchApi(path, options));
}

function pendingHint() {
  try {
    return JSON.parse(localStorage.getItem('carelink.offline.queue') || '[]').length;
  } catch {
    return 0;
  }
}

export async function downloadCsv(path) {
  if (!isBrowserOnline()) {
    throw new Error('Exports need an internet connection.');
  }
  const session = getStoredSession();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Download failed.');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = path.split('/').pop() || 'export.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
