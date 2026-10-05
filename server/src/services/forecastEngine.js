export const FORECAST_MODEL_VERSION = 'carelink-demand-v1';
export const MIN_FORECAST_DAYS = 30;
export const MIN_FORECAST_RECORDS = 30;
export const MIN_CAPACITY_SAMPLES = 10;

const SEVERITY_KEYS = ['critical', 'high', 'moderate', 'low', 'unknown'];
const VULNERABILITY_FIELDS = {
  senior: 'senior_count',
  pregnant: 'pregnant_count',
  pwd: 'pwd_count',
  child: 'child_count',
  infant: 'infant_count',
  indigenous: 'indigenous_count',
  solo_parent: 'solo_parent_count',
};

export function asDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function utcDate(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function addDateDays(dateKey, days) {
  const date = utcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  return Math.floor((utcDate(end) - utcDate(start)) / 86_400_000);
}

function weekday(dateKey) {
  return utcDate(dateKey).getUTCDay();
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
}

function median(values) {
  return quantile(values, 0.5);
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].map(Number).sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function seriesFromRows(rows, throughDate) {
  if (!rows.length) return [];
  const byDate = new Map(rows.map((row) => [asDateKey(row.date), row]));
  const firstDate = [...byDate.keys()].sort()[0];
  if (!firstDate || firstDate > throughDate) return [];

  const output = [];
  for (let date = firstDate; date <= throughDate; date = addDateDays(date, 1)) {
    const row = byDate.get(date) || {};
    const count = Number(row.patient_count || 0);
    const criticalCount = Number(row.critical_count || 0);
    const highCount = Number(row.high_count || 0);
    const moderateCount = Number(row.moderate_count || 0);
    const lowCount = Number(row.low_count || 0);
    output.push({
      date,
      count,
      critical_count: criticalCount,
      high_count: highCount,
      moderate_count: moderateCount,
      low_count: lowCount,
      unknown_count: Math.max(0, count - criticalCount - highCount - moderateCount - lowCount),
      ...Object.fromEntries(
        Object.values(VULNERABILITY_FIELDS).map((field) => [field, Number(row[field] || 0)]),
      ),
    });
  }
  return output;
}

function trailingMean(history, window = 28) {
  return mean(history.slice(-window).map((row) => row.count));
}

function weightedRecentMean(history, window = 7) {
  const rows = history.slice(-window);
  const denominator = rows.reduce((sum, _row, index) => sum + index + 1, 0);
  if (!denominator) return 0;
  return rows.reduce((sum, row, index) => sum + row.count * (index + 1), 0) / denominator;
}

function weekdayMean(history, targetDate) {
  const targetWeekday = weekday(targetDate);
  const matches = history.filter((row) => weekday(row.date) === targetWeekday).slice(-8);
  return matches.length ? mean(matches.map((row) => row.count)) : trailingMean(history);
}

function recentTrend(history) {
  const recent = history.slice(-7);
  const previous = history.slice(-14, -7);
  if (!recent.length || !previous.length) return 0;
  const previousMean = mean(previous.map((row) => row.count));
  if (!previousMean) return 0;
  return clamp((mean(recent.map((row) => row.count)) - previousMean) / previousMean, -0.3, 0.3);
}

function forecastBaseline(history) {
  return Math.max(0, trailingMean(history));
}

function forecastSeasonal(history, targetDate, horizon = 1) {
  const sameWeekday = weekdayMean(history, targetDate);
  const recent = weightedRecentMean(history);
  const longMean = trailingMean(history);
  const trendAdjustment = 1 + (recentTrend(history) * Math.min(horizon, 7) / 7);
  return Math.max(0, (sameWeekday * 0.5) + (recent * 0.3) + (longMean * trendAdjustment * 0.2));
}

function errorMetrics(predictions) {
  if (!predictions.length) return { samples: 0, mae: null, rmse: null, mape: null };
  const absolute = predictions.map((row) => Math.abs(row.actual - row.predicted));
  const squared = predictions.map((row) => (row.actual - row.predicted) ** 2);
  const percentage = predictions
    .filter((row) => row.actual > 0)
    .map((row) => Math.abs(row.actual - row.predicted) / row.actual);
  return {
    samples: predictions.length,
    mae: round(mean(absolute), 2),
    rmse: round(Math.sqrt(mean(squared)), 2),
    mape: percentage.length ? round(mean(percentage) * 100, 2) : null,
  };
}

function validateModels(series) {
  const validationSize = Math.max(7, Math.ceil(series.length * 0.2));
  const start = Math.max(21, series.length - validationSize);
  const baseline = [];
  const seasonal = [];

  for (let index = start; index < series.length; index += 1) {
    const training = series.slice(0, index);
    const actual = series[index].count;
    baseline.push({
      date: series[index].date,
      actual,
      predicted: forecastBaseline(training),
    });
    seasonal.push({
      date: series[index].date,
      actual,
      predicted: forecastSeasonal(training, series[index].date),
    });
  }

  const baselineMetrics = errorMetrics(baseline);
  const seasonalMetrics = errorMetrics(seasonal);
  const selectedName = seasonalMetrics.mae < baselineMetrics.mae
    ? 'weekday_recent_trend'
    : 'historical_mean';
  const selectedRows = selectedName === 'weekday_recent_trend' ? seasonal : baseline;

  return {
    selectedName,
    baseline: baselineMetrics,
    advanced: seasonalMetrics,
    residuals: selectedRows.map((row) => row.actual - row.predicted),
  };
}

function allocateInteger(total, weightedEntries) {
  if (total <= 0 || !weightedEntries.length) {
    return weightedEntries.map((entry) => ({ ...entry, expected: 0 }));
  }
  const weightTotal = weightedEntries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (!weightTotal) {
    return weightedEntries.map((entry) => ({ ...entry, expected: 0 }));
  }
  const shares = weightedEntries.map((entry) => {
    const raw = (Math.max(0, entry.weight) / weightTotal) * total;
    return { ...entry, expected: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });
  let remaining = total - shares.reduce((sum, entry) => sum + entry.expected, 0);
  shares
    .map((entry, index) => ({ index, remainder: entry.remainder }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .forEach(({ index }) => {
      if (remaining <= 0) return;
      shares[index].expected += 1;
      remaining -= 1;
    });
  return shares.map(({ remainder: _remainder, ...entry }) => entry);
}

function blendedHourlyWeights(hourlyRows, targetDate) {
  const targetWeekday = weekday(targetDate);
  const overall = new Map();
  const sameDay = new Map();
  for (const row of hourlyRows) {
    const hour = Number(row.hour);
    const count = Number(row.patient_count || 0);
    overall.set(hour, (overall.get(hour) || 0) + count);
    if (Number(row.weekday) === targetWeekday) {
      sameDay.set(hour, (sameDay.get(hour) || 0) + count);
    }
  }
  const hours = [...new Set([...overall.keys(), ...sameDay.keys()])].sort((a, b) => a - b);
  const overallTotal = [...overall.values()].reduce((sum, value) => sum + value, 0);
  const sameTotal = [...sameDay.values()].reduce((sum, value) => sum + value, 0);
  return hours.map((hour) => ({
    hour,
    weight: sameTotal
      ? (0.7 * ((sameDay.get(hour) || 0) / sameTotal)) + (0.3 * ((overall.get(hour) || 0) / (overallTotal || 1)))
      : (overall.get(hour) || 0) / (overallTotal || 1),
  }));
}

function hourWindow(hourly, preferHigh = true) {
  if (!hourly.length) return { start: null, end: null, expected: null };
  let best = { start: hourly[0].hour, end: hourly[0].hour + 1, expected: hourly[0].expected };
  for (let index = 0; index < hourly.length; index += 1) {
    const current = hourly[index];
    const next = hourly[index + 1];
    const consecutive = next && next.hour === current.hour + 1;
    const expected = current.expected + (consecutive ? next.expected : 0);
    const better = preferHigh ? expected > best.expected : expected < best.expected;
    if (better) {
      best = { start: current.hour, end: current.hour + (consecutive ? 2 : 1), expected };
    }
  }
  return best;
}

function blendedCategoryWeights(series, targetDate, fields) {
  const overallRows = series;
  const weekdayRows = series.filter((row) => weekday(row.date) === weekday(targetDate));
  const totals = (rows) => Object.fromEntries(fields.map((field) => [
    field,
    rows.reduce((sum, row) => sum + Number(row[field] || 0), 0),
  ]));
  const overall = totals(overallRows);
  const sameDay = totals(weekdayRows);
  const overallTotal = overallRows.reduce((sum, row) => sum + row.count, 0) || 1;
  const sameDayTotal = weekdayRows.reduce((sum, row) => sum + row.count, 0);
  return fields.map((field) => ({
    field,
    weight: sameDayTotal
      ? (0.7 * (sameDay[field] / sameDayTotal)) + (0.3 * (overall[field] / overallTotal))
      : overall[field] / overallTotal,
  }));
}

function severityForecast(series, targetDate, expected) {
  const fields = SEVERITY_KEYS.map((key) => `${key}_count`);
  return Object.fromEntries(
    allocateInteger(expected, blendedCategoryWeights(series, targetDate, fields))
      .map((entry) => [entry.field.replace(/_count$/, ''), entry.expected]),
  );
}

function vulnerabilityForecast(series, targetDate, expected) {
  const weights = blendedCategoryWeights(series, targetDate, Object.values(VULNERABILITY_FIELDS));
  return Object.fromEntries(weights.map((entry) => [
    Object.entries(VULNERABILITY_FIELDS).find(([, field]) => field === entry.field)?.[0] || entry.field,
    Math.max(0, Math.round(expected * entry.weight)),
  ]));
}

function queueLoadFor(expected, series) {
  const counts = series.map((row) => row.count);
  if (!counts.length) return 'unavailable';
  if (expected <= quantile(counts, 0.5)) return 'low';
  if (expected <= quantile(counts, 0.75)) return 'moderate';
  if (expected <= quantile(counts, 0.9)) return 'high';
  return 'critical';
}

function capacityEstimate(capacityRows, hourly) {
  const byHour = new Map();
  for (const row of capacityRows) {
    const date = asDateKey(row.service_date);
    const hour = Number(row.service_hour);
    if (!date || !Number.isFinite(hour)) continue;
    const key = `${date}:${hour}`;
    byHour.set(key, (byHour.get(key) || 0) + 1);
  }
  const samples = [...byHour.values()];
  if (samples.length < MIN_CAPACITY_SAMPLES) {
    return {
      expectedPeakQueue: null,
      observedHourlyCapacity: null,
      capacityStatus: 'unavailable',
      capacitySamples: samples.length,
    };
  }
  const hourlyCapacity = Math.max(1, median(samples));
  let backlog = 0;
  let peak = 0;
  for (const row of hourly) {
    backlog = Math.max(0, backlog + row.expected - hourlyCapacity);
    peak = Math.max(peak, backlog);
  }
  return {
    expectedPeakQueue: Math.ceil(peak),
    observedHourlyCapacity: round(hourlyCapacity, 1),
    capacityStatus: 'historical_throughput',
    capacitySamples: samples.length,
  };
}

function historicalEstimates(series, hourlyRows) {
  const active = series.filter((row) => row.count > 0);
  const hourlyTotals = new Map();
  for (const row of hourlyRows) {
    const hour = Number(row.hour);
    hourlyTotals.set(hour, (hourlyTotals.get(hour) || 0) + Number(row.patient_count || 0));
  }
  const activeDayDivisor = Math.max(active.length, 1);
  return {
    average_daily_patients: round(mean(series.map((row) => row.count)), 1),
    average_on_active_days: round(mean(active.map((row) => row.count)), 1),
    hourly_average: [...hourlyTotals.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, count]) => ({ hour, average: round(count / activeDayDivisor, 1) })),
  };
}

export function buildHistoricalSnapshot({ dailyRows = [], hourlyRows = [], todayDate } = {}) {
  const trainingEnd = addDateDays(todayDate, -1);
  const allSeries = seriesFromRows(dailyRows, todayDate);
  const series = allSeries.filter((row) => row.date <= trainingEnd);
  const sourceRecordCount = series.reduce((sum, row) => sum + row.count, 0);
  const todayActual = allSeries.find((row) => row.date === todayDate)?.count || 0;
  const enoughData = series.length >= MIN_FORECAST_DAYS && sourceRecordCount >= MIN_FORECAST_RECORDS;
  return {
    coverage: {
      first_date: series[0]?.date || null,
      last_complete_date: trainingEnd,
      calendar_days: series.length,
      active_days: series.filter((row) => row.count > 0).length,
      record_count: sourceRecordCount,
      minimum_calendar_days: MIN_FORECAST_DAYS,
      minimum_records: MIN_FORECAST_RECORDS,
    },
    historical_estimates: historicalEstimates(series, hourlyRows),
    historical_actuals: allSeries.slice(-30).map((row) => ({ date: row.date, actual: row.count })),
    today_actual: todayActual,
    anomaly: enoughData
      ? anomalyForToday(series, todayDate, todayActual)
      : { status: 'unavailable', reason: 'At least 30 completed calendar days are required.' },
  };
}

function anomalyForToday(series, todayDate, todayCount) {
  const comparable = series.filter((row) => weekday(row.date) === weekday(todayDate)).map((row) => row.count);
  if (comparable.length < 4) return { status: 'unavailable', reason: 'Insufficient same-weekday history.' };
  const average = mean(comparable);
  const variance = mean(comparable.map((value) => (value - average) ** 2));
  const deviation = Math.sqrt(variance);
  const zScore = deviation ? (todayCount - average) / deviation : 0;
  return {
    status: zScore >= 3 ? 'anomalous' : zScore >= 2 ? 'elevated' : 'normal',
    z_score: round(zScore, 2),
    same_weekday_average: round(average, 1),
  };
}

export function calculateAccuracyMetrics(rows = []) {
  const pairs = rows
    .filter((row) => row.actual_patient_count != null && row.predicted_patient_count != null)
    .map((row) => ({
      date: asDateKey(row.forecast_date),
      actual: Number(row.actual_patient_count),
      predicted: Number(row.predicted_patient_count),
    }));
  const metrics = errorMetrics(pairs);
  return {
    available: pairs.length >= 7,
    ...metrics,
    accuracy_percent: metrics.mape == null || pairs.length < 7
      ? null
      : round(Math.max(0, 100 - metrics.mape), 1),
    trend: pairs.slice(-30).map((row) => ({
      date: row.date,
      predicted: row.predicted,
      actual: row.actual,
      error: Math.abs(row.predicted - row.actual),
    })),
  };
}

function formatHourLabel(hour) {
  if (hour == null) return 'unavailable';
  const normalized = Number(hour) % 24;
  if (normalized === 0) return '12 AM';
  if (normalized === 12) return '12 PM';
  return normalized > 12 ? `${normalized - 12} PM` : `${normalized} AM`;
}

function weekdayName(dateKey) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday(dateKey)] || dateKey;
}

export function buildForecastAiInsights(analysis = {}) {
  const forecasts = analysis.forecasts || [];
  const tomorrow = forecasts[0];
  const coverage = analysis.coverage || {};
  const historical = analysis.historical_estimates || {};
  const centers = analysis.referring_centers || [];
  const model = analysis.model || {};

  if (analysis.status !== 'forecast_available' || !tomorrow) {
    return {
      status: 'awaiting_history',
      headline: 'AI demand model is still collecting history',
      confidence: 'limited',
      summary: analysis.message || 'At least 30 completed calendar days and 30 registrations are required before CareLink publishes a forward forecast.',
      bullets: [
        `${coverage.calendar_days || 0} of ${coverage.minimum_calendar_days || 30} required calendar days are on file.`,
        `${coverage.record_count || 0} of ${coverage.minimum_records || 30} required historical arrivals are on file.`,
        `Current daily historical average is ${historical.average_daily_patients || 0} patients.`,
      ],
      actions: ['Keep recording every referral and served-queue time so the AI model can validate a 7-day forecast.'],
      staffing: null,
      watchlist: [],
    };
  }

  const weekExpected = forecasts.reduce((sum, row) => sum + Number(row.expected || 0), 0);
  const busiest = forecasts.reduce((best, row) => (row.expected > best.expected ? row : best), tomorrow);
  const lightest = forecasts.reduce((best, row) => (row.expected < best.expected ? row : best), tomorrow);
  const highSeverity = Number(tomorrow.severity?.high || 0) + Number(tomorrow.severity?.critical || 0);
  const topVulnerability = Object.entries(tomorrow.vulnerability || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .filter(([, value]) => Number(value) > 0)
    .slice(0, 3)
    .map(([label, value]) => `${label.replaceAll('_', ' ')} (${value})`);
  const topCenters = centers.slice(0, 3).map((row) => `${row.label} (${row.count})`);
  const load = String(tomorrow.queueLoad || 'unavailable');
  const staffing = load === 'critical' || load === 'high'
    ? `Add a second intake window during ${formatHourLabel(tomorrow.peakStartHour)}–${formatHourLabel(tomorrow.peakEndHour)}. AI expects ${tomorrow.expected} arrivals and ${load} queue load.`
    : load === 'moderate'
      ? `Keep the regular roster and pre-assign one floater for ${formatHourLabel(tomorrow.peakStartHour)}–${formatHourLabel(tomorrow.peakEndHour)}.`
      : `Standard staffing is enough tomorrow. Use ${formatHourLabel(tomorrow.lowDemandStartHour)}–${formatHourLabel(tomorrow.lowDemandEndHour)} for catch-up and records.`;

  return {
    status: 'ready',
    headline: `AI expects ${tomorrow.expected} patients tomorrow (${weekdayName(tomorrow.date)})`,
    confidence: model.confidence_status || 'limited',
    model_name: String(model.name || 'historical_mean').replaceAll('_', ' '),
    summary: `The selected ${String(model.name || 'demand').replaceAll('_', ' ')} model projects ${weekExpected} arrivals over the next ${forecasts.length} days, with the heaviest day on ${weekdayName(busiest.date)} (${busiest.expected}).`,
    bullets: [
      `Tomorrow range ${tomorrow.lower}–${tomorrow.upper} based on residual error from ${model.validation?.advanced?.samples || model.training_days || 0} validated days.`,
      `Peak demand window: ${formatHourLabel(tomorrow.peakStartHour)}–${formatHourLabel(tomorrow.peakEndHour)}${tomorrow.peakExpectedArrivals != null ? ` · ${tomorrow.peakExpectedArrivals} expected` : ''}.`,
      `High/critical severity share tomorrow: ${highSeverity} of ${tomorrow.expected}.`,
      topVulnerability.length ? `Priority-group pressure: ${topVulnerability.join(', ')}.` : 'No concentrated priority-group pressure in the historical mix.',
      topCenters.length ? `Highest referring volume: ${topCenters.join(', ')}.` : 'Referring-center mix is still too thin to rank.',
      `Lightest forecast day is ${weekdayName(lightest.date)} with ${lightest.expected} expected arrivals.`,
    ],
    actions: [
      staffing,
      highSeverity >= 3 ? 'Reserve a fast-track lane for high and critical severity cases during the peak window.' : 'Keep the current severity triage order; no extra critical lane is indicated.',
      tomorrow.expectedPeakQueue != null
        ? `Historical throughput implies a peak backlog near ${tomorrow.expectedPeakQueue}.`
        : 'Serve more completed-queue timestamps so AI can estimate peak backlog.',
    ],
    staffing,
    watchlist: [
      { label: 'Busiest forecast day', value: `${weekdayName(busiest.date)} · ${busiest.expected}` },
      { label: 'Lightest forecast day', value: `${weekdayName(lightest.date)} · ${lightest.expected}` },
      { label: 'Queue load tomorrow', value: load.replaceAll('_', ' ') },
      { label: 'Week expected total', value: String(weekExpected) },
    ],
  };
}

export function generateForecastAnalysis({
  dailyRows = [],
  hourlyRows = [],
  capacityRows = [],
  referringCenters = [],
  todayDate,
  forecastDays = 7,
} = {}) {
  const trainingEnd = addDateDays(todayDate, -1);
  const allSeries = seriesFromRows(dailyRows, todayDate);
  const series = allSeries.filter((row) => row.date <= trainingEnd);
  const todayCount = allSeries.find((row) => row.date === todayDate)?.count || 0;
  const sourceRecordCount = series.reduce((sum, row) => sum + row.count, 0);
  const activeDays = series.filter((row) => row.count > 0).length;
  const coverage = {
    first_date: series[0]?.date || null,
    last_complete_date: trainingEnd,
    calendar_days: series.length,
    active_days: activeDays,
    record_count: sourceRecordCount,
    minimum_calendar_days: MIN_FORECAST_DAYS,
    minimum_records: MIN_FORECAST_RECORDS,
  };
  const historical = historicalEstimates(series, hourlyRows);
  const historicalActuals = allSeries.slice(-30).map((row) => ({ date: row.date, actual: row.count }));
  const enoughData = series.length >= MIN_FORECAST_DAYS && sourceRecordCount >= MIN_FORECAST_RECORDS;

  if (!enoughData) {
    const insufficient = {
      status: 'insufficient_data',
      message: 'Insufficient historical data for reliable forecasting.',
      recommendation: 'Continue collecting patient registration and queue data.',
      coverage,
      historical_estimates: historical,
      historical_actuals: historicalActuals,
      referring_centers: referringCenters,
      today_actual: todayCount,
      anomaly: { status: 'unavailable', reason: 'At least 30 completed calendar days are required.' },
      forecasts: [],
      model: null,
    };
    return { ...insufficient, ai_insights: buildForecastAiInsights(insufficient) };
  }

  const validation = validateModels(series);
  const selectedForecast = validation.selectedName === 'weekday_recent_trend'
    ? forecastSeasonal
    : forecastBaseline;
  const residualLow = quantile(validation.residuals, 0.1);
  const residualHigh = quantile(validation.residuals, 0.9);
  const confidenceStatus = validation.residuals.length >= 7 ? 'validated_range' : 'limited';

  const forecasts = [];
  for (let horizon = 1; horizon <= Math.min(Math.max(forecastDays, 1), 14); horizon += 1) {
    const date = addDateDays(todayDate, horizon);
    const rawExpected = selectedForecast(series, date, horizon);
    const expected = Math.max(0, Math.round(rawExpected));
    const lower = Math.max(0, Math.floor(rawExpected + residualLow));
    const upper = Math.max(expected, Math.ceil(rawExpected + residualHigh));
    const hourly = allocateInteger(expected, blendedHourlyWeights(hourlyRows, date));
    const peak = hourWindow(hourly, true);
    const lowDemand = hourWindow(hourly, false);
    const capacity = capacityEstimate(capacityRows, hourly);
    const weekdayAverage = weekdayMean(series, date);
    const recentAverage = mean(series.slice(-7).map((row) => row.count));
    const trendPercent = recentTrend(series) * 100;

    forecasts.push({
      date,
      expected,
      lower: Math.min(lower, expected),
      upper,
      hourly,
      severity: severityForecast(series, date, expected),
      vulnerability: vulnerabilityForecast(series, date, expected),
      peakStartHour: peak.start,
      peakEndHour: peak.end,
      peakExpectedArrivals: peak.expected,
      lowDemandStartHour: lowDemand.start,
      lowDemandEndHour: lowDemand.end,
      queueLoad: queueLoadFor(expected, series),
      expectedPeakQueue: capacity.expectedPeakQueue,
      capacityStatus: capacity.capacityStatus,
      capacitySamples: capacity.capacitySamples,
      observedHourlyCapacity: capacity.observedHourlyCapacity,
      explanationFactors: [
        `Historical daily average: ${round(trailingMean(series), 1)}`,
        `Same-weekday average: ${round(weekdayAverage, 1)}`,
        `Recent 7-day average: ${round(recentAverage, 1)}`,
        `Recent trend: ${trendPercent >= 0 ? '+' : ''}${round(trendPercent, 1)}%`,
      ],
    });
  }

  const available = {
    status: 'forecast_available',
    coverage,
    historical_estimates: historical,
    historical_actuals: historicalActuals,
    referring_centers: referringCenters,
    today_actual: todayCount,
    anomaly: anomalyForToday(series, todayDate, todayCount),
    forecasts,
    model: {
      name: validation.selectedName,
      version: FORECAST_MODEL_VERSION,
      confidence_status: confidenceStatus,
      validation: {
        baseline: validation.baseline,
        advanced: validation.advanced,
        selected: validation.selectedName,
        residual_samples: validation.residuals.length,
      },
      training_start: series[0].date,
      training_end: trainingEnd,
      training_days: series.length,
      source_record_count: sourceRecordCount,
    },
  };
  return { ...available, ai_insights: buildForecastAiInsights(available) };
}

