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
const OFFLINE_QUEUE_KEY = 'carelink.offline-queue';
const OFFLINE_CACHE_KEY = 'carelink.offline-cache';

function normalizeCacheKey(path = '/') {
  return String(path).replace(/\/+$/, '') || '/';
}

function normalizeBasePath(path = '/') {
  return String(path).split('?')[0].replace(/\/+$/, '') || '/';
}

function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function getJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors and keep the request working in-memory for this session.
  }
}

function getOfflineQueue() {
  return getJsonStorage(OFFLINE_QUEUE_KEY, []);
}

function saveOfflineQueue(queue) {
  setJsonStorage(OFFLINE_QUEUE_KEY, queue);
}

function getOfflineCache() {
  return getJsonStorage(OFFLINE_CACHE_KEY, {});
}

function saveOfflineCache(cache) {
  setJsonStorage(OFFLINE_CACHE_KEY, cache);
}

function readCachedResponse(path) {
  const cache = getOfflineCache();
  const key = normalizeCacheKey(path);
  return cache[key] ?? null;
}

function saveCachedResponse(path, payload) {
  if (!payload || typeof payload !== 'object') return;
  const cache = getOfflineCache();
  const key = normalizeCacheKey(path);
  cache[key] = payload;
  saveOfflineCache(cache);
}

function hydrateCacheFromMutation(path, method, payload) {
  if (!payload || typeof payload !== 'object') return;

  const cache = getOfflineCache();
  const normalizedPath = normalizeBasePath(path);
  const listKeyMap = {
    '/patients': 'patients',
    '/referrals': 'referrals',
    '/queue': 'queue',
  };

  const listKey = listKeyMap[normalizedPath] || null;
  if (!listKey) {
    saveCachedResponse(path, payload);
    return;
  }

  const current = cache[normalizedPath] || { [listKey]: [] };
  const list = Array.isArray(current[listKey]) ? current[listKey] : [];
  const mutationId = payload.id || payload.patient_id || payload.referral_id || payload.queue_id;

  if (method === 'POST') {
    const entry = { ...payload, ...(mutationId ? { id: mutationId } : {}) };
    list.unshift(entry);
  } else {
    const index = list.findIndex((entry) => String(entry.id || entry.patient_id || entry.referral_id || entry.queue_id) === String(mutationId || ''));
    if (index >= 0) {
      list[index] = { ...list[index], ...payload };
    } else {
      list.unshift({ ...payload, ...(mutationId ? { id: mutationId } : {}) });
    }
  }

  cache[normalizedPath] = { ...current, [listKey]: list };
  saveOfflineCache(cache);
}

async function flushOfflineQueue() {
  if (!isOnline()) return;

  const queue = getOfflineQueue();
  if (!queue.length) return;

  const remaining = [];

  for (const item of queue) {
    try {
      const response = await fetch(`${API_BASE}${item.path}`, {
        method: item.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(item.token ? { Authorization: `Bearer ${item.token}` } : {}),
        },
        body: item.body ? JSON.stringify(item.body) : undefined,
      });

      if (!response.ok) {
        remaining.push(item);
        continue;
      }

      const payload = await response.json().catch(() => ({}));
      saveCachedResponse(item.path, payload);
      hydrateCacheFromMutation(item.path, item.method, payload);
    } catch {
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
}

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
  const method = (options.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

  if (!isOnline()) {
    if (isMutation) {
      const queue = getOfflineQueue();
      const parsedBody = typeof options.body === 'string' ? (() => {
        try {
          return JSON.parse(options.body);
        } catch {
          return options.body;
        }
      })() : options.body;
      const entry = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        path,
        method,
        token: session?.token || null,
        body: parsedBody,
        created_at: new Date().toISOString(),
      };
      queue.push(entry);
      saveOfflineQueue(queue);
      hydrateCacheFromMutation(path, method, parsedBody);
      return {
        offline: true,
        queued: true,
        message: 'Offline mode: your update was saved locally and will sync automatically when the connection is restored.',
      };
    }

    const cached = readCachedResponse(path);
    if (cached) {
      return { ...cached, offline: true, cached: true };
    }

    return {
      offline: true,
      cached: false,
      message: 'No saved data is available yet for this screen while offline.',
    };
  }

  try {
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
      const cached = readCachedResponse(path);
      if ((response.status >= 500 || response.status === 0) && cached) {
        return { ...cached, offline: true, cached: true };
      }

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

    if (Object.keys(data || {}).length) {
      saveCachedResponse(path, data);
    }

    if (isMutation) {
      flushOfflineQueue();
    }

    return data;
  } catch (error) {
    const cached = readCachedResponse(path);
    if (cached && (error?.name === 'TypeError' || error?.message === 'Failed to fetch')) {
      return { ...cached, offline: true, cached: true };
    }
    throw error;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushOfflineQueue();
  });
  if (isOnline()) {
    flushOfflineQueue();
  }
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
    const data = await fetchApi(path, options);
    return data;
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
