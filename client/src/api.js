import { SITE_URL } from './config/site.js';

function resolveApiBase() {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

  if (import.meta.env.DEV) {
    return configured || '/api';
  }

  // Production builds must point at the live Express host (Render/Railway/etc.).
  // Relative "/api" hits the Vercel static site and returns 405 on POST.
  if (configured.startsWith('http://') || configured.startsWith('https://')) {
    return configured;
  }

  console.error(
    `[CareLink] Missing VITE_API_BASE_URL. Set it in Vercel to your API URL, e.g. https://your-api.onrender.com/api (site: ${SITE_URL}).`,
  );
  return '';
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

export async function api(path, options = {}) {
  if (!API_BASE) {
    const error = new Error(
      'API is not configured. Set VITE_API_BASE_URL in Vercel to your live API URL (e.g. https://your-api.onrender.com/api), then redeploy.',
    );
    error.status = 0;
    error.issues = [];
    throw error;
  }

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
      ? 'API not reachable (405). Deploy the Express server and set VITE_API_BASE_URL to that host, then redeploy the frontend.'
      : (data.message || 'Request failed.');
    const error = new Error(message);
    error.status = response.status;
    error.issues = data.issues || [];
    throw error;
  }

  return data;
}

export async function downloadCsv(path) {
  if (!API_BASE) {
    throw new Error('API is not configured. Set VITE_API_BASE_URL in Vercel, then redeploy.');
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
