const CACHE_PREFIX = 'carelink.offline.cache.';
const QUEUE_KEY = 'carelink.offline.queue';
const ID_MAP_KEY = 'carelink.offline.idmap';
const META_KEY = 'carelink.offline.meta';

const OFFLINE_WRITES = [
  { method: 'POST', pattern: /^\/patients\/?$/ },
  { method: 'PATCH', pattern: /^\/patients\/[^/]+$/ },
  { method: 'POST', pattern: /^\/referrals\/?$/ },
];

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function sessionScope() {
  const raw = localStorage.getItem('carelink.session');
  const session = safeParse(raw, null);
  return String(session?.user?.id || 'anon');
}

function cacheKey(path) {
  return `${CACHE_PREFIX}${sessionScope()}:${path}`;
}

export function isBrowserOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function readOfflineQueue() {
  return safeParse(localStorage.getItem(QUEUE_KEY), []);
}

function writeOfflineQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  emitOfflineStatus();
}

export function pendingOfflineCount() {
  return readOfflineQueue().length;
}

export function readIdMap() {
  return safeParse(localStorage.getItem(ID_MAP_KEY), {});
}

function writeIdMap(map) {
  localStorage.setItem(ID_MAP_KEY, JSON.stringify(map));
}

export function readCache(path) {
  return safeParse(localStorage.getItem(cacheKey(path)), null);
}

export function writeCache(path, data) {
  try {
    localStorage.setItem(cacheKey(path), JSON.stringify({
      savedAt: new Date().toISOString(),
      data,
    }));
  } catch {
    // Quota errors should not break the app.
  }
}

export function cachedPayload(path) {
  return readCache(path)?.data || null;
}

export function canQueueOfflineWrite(method, path) {
  const verb = String(method || 'GET').toUpperCase();
  return OFFLINE_WRITES.some((rule) => rule.method === verb && rule.pattern.test(path.split('?')[0]));
}

export function enqueueOfflineWrite({ method, path, body, label }) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `op-${Date.now()}`;
  const localId = `local-${id.slice(0, 8)}`;
  const entry = {
    id,
    localId,
    method: String(method || 'POST').toUpperCase(),
    path,
    body: body || {},
    label: label || `${method} ${path}`,
    createdAt: new Date().toISOString(),
  };
  writeOfflineQueue([...readOfflineQueue(), entry]);
  return entry;
}

function rememberSyncMeta(partial) {
  const current = safeParse(localStorage.getItem(META_KEY), {});
  localStorage.setItem(META_KEY, JSON.stringify({ ...current, ...partial }));
}

export function readSyncMeta() {
  return safeParse(localStorage.getItem(META_KEY), {});
}

export function emitOfflineStatus() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('carelink:offline-status', {
    detail: {
      online: isBrowserOnline(),
      pending: pendingOfflineCount(),
      lastSyncAt: readSyncMeta().lastSyncAt || null,
      lastError: readSyncMeta().lastError || null,
    },
  }));
}

function applyOptimisticPatient(path, body, localId) {
  const listPath = cachedListPath('/patients');
  const cached = cachedPayload(listPath) || { patients: [] };
  const record = {
    ...body,
    id: localId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _offline: true,
    _pending: true,
  };
  writeCache(listPath, { ...cached, patients: [record, ...(cached.patients || [])] });
  return record;
}

function applyOptimisticReferral(path, body, localId) {
  const listPath = cachedListPath('/referrals');
  const cached = cachedPayload(listPath) || { referrals: [] };
  const record = {
    ...body,
    id: localId,
    referral_code: `OFFLINE-${localId.slice(-6).toUpperCase()}`,
    tracking_code: `OFFLINE-${localId.slice(-6).toUpperCase()}`,
    status: 'submitted',
    created_at: new Date().toISOString(),
    _offline: true,
    _pending: true,
  };
  writeCache(listPath, { ...cached, referrals: [record, ...(cached.referrals || [])] });
  return record;
}

function cachedListPath(prefix) {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${CACHE_PREFIX}${sessionScope()}:${prefix}`)) {
        return key.slice(`${CACHE_PREFIX}${sessionScope()}:`.length);
      }
    }
  } catch {
    return prefix;
  }
  return prefix;
}

export function optimisticOfflineResponse(entry) {
  if (entry.method === 'POST' && entry.path.startsWith('/patients')) {
    return applyOptimisticPatient(entry.path, entry.body, entry.localId);
  }
  if (entry.method === 'PATCH' && entry.path.startsWith('/patients/')) {
    const listPath = cachedListPath('/patients');
    const cached = cachedPayload(listPath) || { patients: [] };
    const id = entry.path.split('/')[2];
    const patients = (cached.patients || []).map((patient) => (
      String(patient.id) === String(id)
        ? { ...patient, ...entry.body, _pending: true, _offline: true }
        : patient
    ));
    writeCache(listPath, { ...cached, patients });
    return { patient: patients.find((patient) => String(patient.id) === String(id)) || entry.body };
  }
  if (entry.method === 'POST' && entry.path.startsWith('/referrals')) {
    return applyOptimisticReferral(entry.path, entry.body, entry.localId);
  }
  return { queued: true, ...entry.body, id: entry.localId, _offline: true };
}

function remapBody(body, idMap) {
  if (!body || typeof body !== 'object') return body;
  const next = { ...body };
  if (next.patient_id && idMap[String(next.patient_id)]) {
    next.patient_id = idMap[String(next.patient_id)];
  }
  return next;
}

export async function flushOfflineQueue(send) {
  const queue = readOfflineQueue();
  if (!queue.length) {
    rememberSyncMeta({ lastSyncAt: new Date().toISOString(), lastError: null });
    emitOfflineStatus();
    return { flushed: 0 };
  }

  const ordered = [...queue].sort((a, b) => {
    const score = (item) => (item.path.startsWith('/patients') && item.method === 'POST' ? 0 : 1);
    return score(a) - score(b);
  });

  const remaining = [];
  const idMap = readIdMap();
  let flushed = 0;
  let lastError = null;

  for (const entry of ordered) {
    try {
      const body = remapBody(entry.body, idMap);
      const result = await send(entry.path, { method: entry.method, body: JSON.stringify(body) });
      if (entry.localId && result?.id) {
        idMap[entry.localId] = result.id;
      }
      flushed += 1;
    } catch (error) {
      lastError = error.message || 'Sync failed.';
      remaining.push(entry);
    }
  }

  writeIdMap(idMap);
  writeOfflineQueue(remaining);
  rememberSyncMeta({ lastSyncAt: new Date().toISOString(), lastError });
  emitOfflineStatus();
  return { flushed, remaining: remaining.length, lastError };
}

export function networkError(error) {
  const message = String(error?.message || error || '');
  return error?.name === 'TypeError'
    || /failed to fetch|networkerror|load failed|offline|internet/i.test(message);
}
