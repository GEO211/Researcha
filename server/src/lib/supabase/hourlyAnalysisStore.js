import { query, queryOne } from './query.js';

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function nextHourlyAnalysisAt(now = new Date()) {
  const next = new Date(now);
  next.setMinutes(5, 0, 0);
  if (next <= now) next.setHours(next.getHours() + 1);
  return next.toISOString();
}

function mapAnalysis(row) {
  if (!row) return null;
  return {
    id: row.id,
    analysis_time: row.analysis_time,
    period_start: row.period_start,
    period_end: row.period_end,
    status: row.status,
    records_analyzed: row.records_analyzed,
    current_value: numberOrNull(row.current_value),
    prediction: numberOrNull(row.prediction),
    prediction_3h: numberOrNull(row.prediction_3h),
    prediction_6h: numberOrNull(row.prediction_6h),
    prediction_24h: numberOrNull(row.prediction_24h),
    confidence: numberOrNull(row.confidence),
    trend: row.trend,
    anomaly_detected: Boolean(row.anomaly_detected),
    anomaly_score: numberOrNull(row.anomaly_score),
    insight: row.insight,
    recommendation: row.recommendation,
    alert_level: row.alert_level,
    model_version: row.model_version,
    model_metrics: row.model_metrics || {},
    comparisons: row.comparisons || {},
    series: row.series || [],
    created_at: row.created_at,
  };
}

export async function getLatestHourlyAnalysis() {
  const [latest, failure] = await Promise.all([
    queryOne(
      `SELECT * FROM ai_hourly_analysis
       WHERE status = 'success'
       ORDER BY period_start DESC
       LIMIT 1`,
    ),
    queryOne(
      `SELECT analysis_time, period_start, error_message
       FROM ai_hourly_analysis
       WHERE status = 'failed'
       ORDER BY period_start DESC
       LIMIT 1`,
    ),
  ]);
  const analysis = mapAnalysis(latest);
  const failedLater = failure && (!analysis || new Date(failure.period_start) > new Date(analysis.period_start));
  return {
    analysis,
    next_analysis_at: nextHourlyAnalysisAt(),
    last_error: failedLater ? {
      analysis_time: failure.analysis_time,
      period_start: failure.period_start,
      error_message: failure.error_message,
    } : null,
  };
}

export async function listHourlyAnalyses(limit = 48) {
  const size = Math.min(Math.max(Number(limit) || 48, 1), 168);
  const rows = await query(
    `SELECT * FROM ai_hourly_analysis
     WHERE status = 'success'
     ORDER BY period_start DESC
     LIMIT $1`,
    [size],
  );
  return rows.map(mapAnalysis);
}
