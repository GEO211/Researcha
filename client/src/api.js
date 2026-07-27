import { SITE_URL } from './config/site.js';

function resolveApiBase() {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

  if (import.meta.env.DEV) {
    return configured || '/api';
  }

  // Production (https://carelink-bay.vercel.app) — require full API URL in Vercel env.
  if (configured.startsWith('http')) {
    return configured;
  }

  console.warn(
    `[CareLink] Set VITE_API_BASE_URL in Vercel to your live API URL. Site: ${SITE_URL}`,
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

export async function api(path, options = {}) {
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
    const error = new Error(data.message || 'Request failed.');
    error.status = response.status;
    error.issues = data.issues || [];
    throw error;
  }

  return data;
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
