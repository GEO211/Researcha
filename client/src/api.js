import { SITE_URL } from './config/site.js';

function resolveApiBase() {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

  if (import.meta.env.DEV) {
    return configured || '/api';
  }

  // Same-origin on Vercel (api/ serverless) or a full remote API URL.
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

function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function getOfflineQueue() {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

async function flushOfflineQueue() {
  if (!isOnline()) return;

  const queue = getOfflineQueue();
  if (!queue.length) return;

  const remaining = [];

  for (const item of queue) {
    try {
      await fetch(`${API_BASE}${item.path}`, {
        method: item.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(item.token ? { Authorization: `Bearer ${item.token}` } : {}),
        },
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
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

export async function api(path, options = {}) {
  const session = getStoredSession();
  const method = (options.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

  if (!isOnline() && isMutation) {
    const queue = getOfflineQueue();
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      path,
      method,
      token: session?.token || null,
      body: options.body ? JSON.parse(options.body) : null,
      created_at: new Date().toISOString(),
    };
    queue.push(entry);
    saveOfflineQueue(queue);
    return { offline: true, queued: true, message: 'Offline mode: your update was saved locally and will sync automatically when the connection is restored.' };
  }

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

  if (isMutation) {
    flushOfflineQueue();
  }

  return data;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushOfflineQueue();
  });
}

export async function downloadCsv(path) {
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
