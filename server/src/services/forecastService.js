import {
  forecastScopeForUser,
  getDailyForecastHistory,
  getForecastSourceSummary,
  getHourlyForecastHistory,
  getQueueCapacityHistory,
  getReferringCenterHistory,
  listForecastAccuracy,
  listForecastUsers,
  listStoredForecasts,
  reconcileForecastActuals,
  upsertForecasts,
} from '../lib/supabase/forecastStore.js';
import {
  FORECAST_MODEL_VERSION,
  addDateDays,
  buildForecastAiInsights,
  buildHistoricalSnapshot,
  calculateAccuracyMetrics,
  generateForecastAnalysis,
} from './forecastEngine.js';

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Manila';
const CACHE_TTL_MS = 15 * 60 * 1000;
const responseCache = new Map();

function appDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function jsonValue(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sameInstant(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

function reconstructHourWindow(hourly, preferHigh = true) {
  if (!hourly.length) return { start: null, end: null, expected: null };
  let best = { start: hourly[0].hour, end: hourly[0].hour + 1, expected: Number(hourly[0].expected || 0) };
  for (let index = 0; index < hourly.length; index += 1) {
    const current = hourly[index];
    const next = hourly[index + 1];
    const consecutive = next && Number(next.hour) === Number(current.hour) + 1;
    const expected = Number(current.expected || 0) + (consecutive ? Number(next.expected || 0) : 0);
    const better = preferHigh ? expected > best.expected : expected < best.expected;
    if (better) {
      best = { start: Number(current.hour), end: Number(current.hour) + (consecutive ? 2 : 1), expected };
    }
  }
  return best;
}

function storedForecast(row) {
  const hourly = jsonValue(row.hourly_forecast, []);
  const peakExpectedArrivals = hourly
    .filter((entry) => entry.hour >= row.peak_start_hour && entry.hour < row.peak_end_hour)
    .reduce((sum, entry) => sum + Number(entry.expected || 0), 0);
  const lowDemand = reconstructHourWindow(hourly, false);
  return {
    date: dateKey(row.forecast_date),
    expected: Number(row.predicted_patient_count),
    lower: Number(row.lower_bound),
    upper: Number(row.upper_bound),
    hourly,
    severity: jsonValue(row.severity_forecast, {}),
    vulnerability: jsonValue(row.vulnerability_forecast, {}),
    peakStartHour: row.peak_start_hour == null ? null : Number(row.peak_start_hour),
    peakEndHour: row.peak_end_hour == null ? null : Number(row.peak_end_hour),
    peakExpectedArrivals,
    lowDemandStartHour: lowDemand.start,
    lowDemandEndHour: lowDemand.end,
    queueLoad: row.predicted_queue_load,
    expectedPeakQueue: row.expected_peak_queue == null ? null : Number(row.expected_peak_queue),
    capacityStatus: row.expected_peak_queue == null ? 'unavailable' : 'historical_throughput',
    explanationFactors: jsonValue(row.explanation_factors, []),
  };
}

function sourceIsCurrent(rows, sourceSummary) {
  return rows.length > 0 && rows.every((row) => (
    row.model_version === FORECAST_MODEL_VERSION
    && sameInstant(row.source_updated_at, sourceSummary?.source_updated_at)
  ));
}

function cachedResponse(scopeKey, sourceUpdatedAt) {
  const cached = responseCache.get(scopeKey);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return sameInstant(cached.sourceUpdatedAt, sourceUpdatedAt) ? cached.payload : null;
}

function setCachedResponse(scopeKey, sourceUpdatedAt, payload) {
  responseCache.set(scopeKey, {
    sourceUpdatedAt,
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function invalidateForecastCache() {
  responseCache.clear();
}

async function accuracyForScope(scopeKey) {
  const rows = await listForecastAccuracy(scopeKey);
  return calculateAccuracyMetrics([...rows].reverse());
}

export async function getPatientDemandForecast(user, { force = false } = {}) {
  const scope = forecastScopeForUser(user);
  const today = appDate();
  const tomorrow = addDateDays(today, 1);
  const forecastEnd = addDateDays(today, 7);

  await reconcileForecastActuals(scope, today);
  const sourceSummary = await getForecastSourceSummary(scope);
  if (!force) {
    const cached = cachedResponse(scope.key, sourceSummary?.source_updated_at);
    if (cached) return cached;
  }

  const stored = force ? [] : await listStoredForecasts(scope.key, tomorrow, forecastEnd);
  const trainingEnd = addDateDays(today, -1);
  const [dailyRows, hourlyRows, referringCenters] = await Promise.all([
    getDailyForecastHistory(scope, today),
    getHourlyForecastHistory(scope, trainingEnd),
    getReferringCenterHistory(scope, trainingEnd),
  ]);
  const snapshot = buildHistoricalSnapshot({ dailyRows, hourlyRows, todayDate: today });
  snapshot.referring_centers = referringCenters;
  const accuracy = await accuracyForScope(scope.key);

  if (!force && stored.length === 7 && sourceIsCurrent(stored, sourceSummary)) {
    const first = stored[0];
    const payload = {
      status: 'forecast_available',
      generated_at: first.generated_at,
      scope: { key: scope.key, type: scope.type, health_center_id: scope.healthCenterId },
      ...snapshot,
      forecasts: stored.map(storedForecast),
      referring_centers: referringCenters,
      model: {
        name: first.model_name,
        version: first.model_version,
        confidence_status: first.confidence_status,
        validation: jsonValue(first.validation_metrics, {}),
        training_start: dateKey(first.training_data_start),
        training_end: dateKey(first.training_data_end),
        training_days: Number(first.training_days),
        source_record_count: Number(first.source_record_count),
      },
      accuracy,
      source: 'persisted_forecast',
      disclaimer: 'Forecasts are estimates based on historical registration data and support operational planning. They do not constitute medical diagnosis, clinical prediction, or treatment recommendations.',
    };
    payload.ai_insights = buildForecastAiInsights(payload);
    setCachedResponse(scope.key, sourceSummary?.source_updated_at, payload);
    return payload;
  }

  const capacityRows = await getQueueCapacityHistory(scope, trainingEnd);
  const analysis = generateForecastAnalysis({
    dailyRows,
    hourlyRows,
    capacityRows,
    referringCenters,
    todayDate: today,
    forecastDays: 7,
  });

  if (analysis.status === 'forecast_available') {
    await upsertForecasts(scope, analysis.forecasts, {
      modelName: analysis.model.name,
      modelVersion: analysis.model.version,
      trainingStart: analysis.model.training_start,
      trainingEnd: analysis.model.training_end,
      trainingDays: analysis.model.training_days,
      sourceRecordCount: analysis.model.source_record_count,
      sourceUpdatedAt: sourceSummary?.source_updated_at || null,
      confidenceStatus: analysis.model.confidence_status,
      validationMetrics: analysis.model.validation,
    });
  }

  const payload = {
    ...analysis,
    generated_at: new Date().toISOString(),
    scope: { key: scope.key, type: scope.type, health_center_id: scope.healthCenterId },
    accuracy,
    source: 'historical_database',
    disclaimer: 'Forecasts are estimates based on historical registration data and support operational planning. They do not constitute medical diagnosis, clinical prediction, or treatment recommendations.',
  };
  setCachedResponse(scope.key, sourceSummary?.source_updated_at, payload);
  return payload;
}

export async function refreshScheduledForecasts() {
  const users = await listForecastUsers();
  const unique = new Map(users.map((user) => [forecastScopeForUser(user).key, user]));
  const results = [];
  for (const user of unique.values()) {
    try {
      const result = await getPatientDemandForecast(user, { force: true });
      results.push({ scope: result.scope.key, status: result.status });
    } catch (error) {
      results.push({ scope: forecastScopeForUser(user).key, status: 'failed', error: error.message });
    }
  }
  return results;
}

