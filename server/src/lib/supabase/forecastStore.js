import { query, queryOne, withTransaction } from './query.js';
import { asDateKey } from '../../services/forecastEngine.js';

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Manila';

function dateKey(value) {
  return asDateKey(value);
}

function scopeClause(scope, alias = 'r', startingIndex = 1) {
  if (!scope?.healthCenterId || scope.type === 'citywide') {
    return { sql: '', params: [] };
  }
  const column = scope.type === 'referring_center'
    ? `${alias}.referring_health_center_id`
    : `${alias}.receiving_health_center_id`;
  return {
    sql: ` AND ${column} = $${startingIndex}`,
    params: [Number(scope.healthCenterId)],
  };
}

export function forecastScopeForUser(user = {}) {
  const healthCenterId = Number(user.health_center_id) || null;
  if (user.role === 'barangay_staff' && healthCenterId) {
    return {
      key: `referring_center:${healthCenterId}`,
      type: 'referring_center',
      healthCenterId,
    };
  }
  if (healthCenterId) {
    return {
      key: `receiving_center:${healthCenterId}`,
      type: 'receiving_center',
      healthCenterId,
    };
  }
  return { key: 'citywide:all', type: 'citywide', healthCenterId: null };
}

export async function listForecastUsers() {
  return query(
    `SELECT DISTINCT role, health_center_id
     FROM users
     WHERE status = 'active'
       AND role IN ('city_staff', 'barangay_staff')
       AND health_center_id IS NOT NULL
     ORDER BY role, health_center_id`,
  );
}

export async function getForecastSourceSummary(scope) {
  const scoped = scopeClause(scope, 'r', 2);
  return queryOne(
    `SELECT
       COUNT(r.id)::int AS record_count,
       MIN((r.created_at AT TIME ZONE $1)::date) AS first_date,
       MAX((r.created_at AT TIME ZONE $1)::date) AS last_date,
       MAX(GREATEST(
         r.updated_at,
         COALESCE(p.updated_at, r.updated_at),
         COALESCE(q.updated_at, r.updated_at)
       )) AS source_updated_at
     FROM referrals r
     JOIN patients p ON p.id = r.patient_id
     LEFT JOIN queue_entries q ON q.referral_id = r.id
     WHERE 1 = 1${scoped.sql}`,
    [APP_TIMEZONE, ...scoped.params],
  );
}

export async function getDailyForecastHistory(scope, throughDate) {
  const scoped = scopeClause(scope, 'r', 3);
  return query(
    `SELECT
       (r.created_at AT TIME ZONE $1)::date AS date,
       COUNT(*)::int AS patient_count,
       COUNT(*) FILTER (WHERE r.severity_level = 'high')::int AS high_count,
       COUNT(*) FILTER (WHERE r.severity_level = 'moderate')::int AS moderate_count,
       COUNT(*) FILTER (WHERE r.severity_level = 'low')::int AS low_count,
       COUNT(*) FILTER (WHERE r.severity_level = 'critical')::int AS critical_count,
       COUNT(*) FILTER (WHERE p.is_senior)::int AS senior_count,
       COUNT(*) FILTER (WHERE p.is_pregnant)::int AS pregnant_count,
       COUNT(*) FILTER (WHERE p.is_pwd)::int AS pwd_count,
       COUNT(*) FILTER (WHERE p.is_child)::int AS child_count,
       COUNT(*) FILTER (WHERE p.is_infant)::int AS infant_count,
       COUNT(*) FILTER (WHERE p.is_indigenous)::int AS indigenous_count,
       COUNT(*) FILTER (WHERE p.is_solo_parent)::int AS solo_parent_count
     FROM referrals r
     JOIN patients p ON p.id = r.patient_id
     WHERE (r.created_at AT TIME ZONE $1)::date <= $2::date${scoped.sql}
     GROUP BY (r.created_at AT TIME ZONE $1)::date
     ORDER BY date ASC`,
    [APP_TIMEZONE, throughDate, ...scoped.params],
  );
}

export async function getHourlyForecastHistory(scope, throughDate) {
  const scoped = scopeClause(scope, 'r', 3);
  return query(
    `SELECT
       EXTRACT(DOW FROM r.created_at AT TIME ZONE $1)::int AS weekday,
       EXTRACT(HOUR FROM r.created_at AT TIME ZONE $1)::int AS hour,
       COUNT(*)::int AS patient_count
     FROM referrals r
     WHERE (r.created_at AT TIME ZONE $1)::date <= $2::date${scoped.sql}
     GROUP BY weekday, hour
     ORDER BY weekday, hour`,
    [APP_TIMEZONE, throughDate, ...scoped.params],
  );
}

export async function getReferringCenterHistory(scope, throughDate) {
  const scoped = scopeClause(scope, 'r', 3);
  return query(
    `SELECT
       COALESCE(NULLIF(hc.barangay_name, ''), hc.name) AS label,
       COUNT(*)::int AS count
     FROM referrals r
     JOIN health_centers hc ON hc.id = r.referring_health_center_id
     WHERE (r.created_at AT TIME ZONE $1)::date <= $2::date${scoped.sql}
     GROUP BY COALESCE(NULLIF(hc.barangay_name, ''), hc.name)
     ORDER BY count DESC, label ASC
     LIMIT 8`,
    [APP_TIMEZONE, throughDate, ...scoped.params],
  );
}

export async function getQueueCapacityHistory(scope, throughDate) {
  const scoped = scopeClause(scope, 'r', 3);
  return query(
    `SELECT
       EXTRACT(EPOCH FROM (q.served_at - q.called_at)) / 60.0 AS service_minutes,
       (q.served_at AT TIME ZONE $1)::date AS service_date,
       EXTRACT(HOUR FROM q.served_at AT TIME ZONE $1)::int AS service_hour
     FROM queue_entries q
     JOIN referrals r ON r.id = q.referral_id
     WHERE q.called_at IS NOT NULL
       AND q.served_at IS NOT NULL
       AND q.served_at >= q.called_at
       AND (r.created_at AT TIME ZONE $1)::date <= $2::date${scoped.sql}
     ORDER BY q.served_at DESC
     LIMIT 5000`,
    [APP_TIMEZONE, throughDate, ...scoped.params],
  );
}

export async function listStoredForecasts(scopeKey, fromDate, toDate) {
  return query(
    `SELECT * FROM patient_forecasts
     WHERE scope_key = $1
       AND forecast_date BETWEEN $2::date AND $3::date
     ORDER BY forecast_date ASC`,
    [scopeKey, fromDate, toDate],
  );
}

export async function listForecastAccuracy(scopeKey, limit = 90) {
  return query(
    `SELECT forecast_date, predicted_patient_count, actual_patient_count,
            absolute_error, squared_error, absolute_percentage_error
     FROM patient_forecasts
     WHERE scope_key = $1
       AND actual_patient_count IS NOT NULL
     ORDER BY forecast_date DESC
     LIMIT $2`,
    [scopeKey, Math.min(Math.max(Number(limit) || 90, 1), 365)],
  );
}

export async function upsertForecasts(scope, forecasts, metadata) {
  if (!forecasts.length) return [];
  return withTransaction(async (client) => {
    const saved = [];
    for (const forecast of forecasts) {
      const result = await client.query(
        `INSERT INTO patient_forecasts (
           scope_key, scope_type, health_center_id, forecast_date,
           predicted_patient_count, lower_bound, upper_bound,
           hourly_forecast, severity_forecast, vulnerability_forecast,
           peak_start_hour, peak_end_hour, predicted_queue_load, expected_peak_queue,
           model_name, model_version, training_data_start, training_data_end,
           training_days, source_record_count, source_updated_at, confidence_status,
           validation_metrics, explanation_factors, generated_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,
           $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24::jsonb,NOW(),NOW()
         )
         ON CONFLICT (scope_key, forecast_date) DO UPDATE SET
           predicted_patient_count = EXCLUDED.predicted_patient_count,
           lower_bound = EXCLUDED.lower_bound,
           upper_bound = EXCLUDED.upper_bound,
           hourly_forecast = EXCLUDED.hourly_forecast,
           severity_forecast = EXCLUDED.severity_forecast,
           vulnerability_forecast = EXCLUDED.vulnerability_forecast,
           peak_start_hour = EXCLUDED.peak_start_hour,
           peak_end_hour = EXCLUDED.peak_end_hour,
           predicted_queue_load = EXCLUDED.predicted_queue_load,
           expected_peak_queue = EXCLUDED.expected_peak_queue,
           model_name = EXCLUDED.model_name,
           model_version = EXCLUDED.model_version,
           training_data_start = EXCLUDED.training_data_start,
           training_data_end = EXCLUDED.training_data_end,
           training_days = EXCLUDED.training_days,
           source_record_count = EXCLUDED.source_record_count,
           source_updated_at = EXCLUDED.source_updated_at,
           confidence_status = EXCLUDED.confidence_status,
           validation_metrics = EXCLUDED.validation_metrics,
           explanation_factors = EXCLUDED.explanation_factors,
           generated_at = NOW(),
           updated_at = NOW()
         WHERE patient_forecasts.forecast_date > (NOW() AT TIME ZONE $25)::date
         RETURNING *`,
        [
          scope.key,
          scope.type,
          scope.healthCenterId,
          forecast.date,
          forecast.expected,
          forecast.lower,
          forecast.upper,
          JSON.stringify(forecast.hourly || []),
          JSON.stringify(forecast.severity || {}),
          JSON.stringify(forecast.vulnerability || {}),
          forecast.peakStartHour,
          forecast.peakEndHour,
          forecast.queueLoad,
          forecast.expectedPeakQueue,
          metadata.modelName,
          metadata.modelVersion,
          metadata.trainingStart,
          metadata.trainingEnd,
          metadata.trainingDays,
          metadata.sourceRecordCount,
          metadata.sourceUpdatedAt,
          metadata.confidenceStatus,
          JSON.stringify(metadata.validationMetrics || {}),
          JSON.stringify(forecast.explanationFactors || []),
          APP_TIMEZONE,
        ],
      );
      if (result.rows[0]) saved.push(result.rows[0]);
    }
    return saved;
  });
}

export async function reconcileForecastActuals(scope, todayDate) {
  const pending = await query(
    `SELECT id, forecast_date, predicted_patient_count
     FROM patient_forecasts
     WHERE scope_key = $1
       AND forecast_date < $2::date
       AND actual_patient_count IS NULL
     ORDER BY forecast_date ASC`,
    [scope.key, todayDate],
  );
  if (!pending.length) return 0;

  const firstDate = pending[0].forecast_date;
  const scoped = scopeClause(scope, 'r', 4);
  const actualRows = await query(
    `SELECT (r.created_at AT TIME ZONE $1)::date AS date, COUNT(*)::int AS count
     FROM referrals r
     WHERE (r.created_at AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date${scoped.sql}
     GROUP BY date`,
    [APP_TIMEZONE, firstDate, todayDate, ...scoped.params],
  );
  const actualByDate = new Map(actualRows.map((row) => [dateKey(row.date), Number(row.count)]));

  let updated = 0;
  for (const row of pending) {
    const key = dateKey(row.forecast_date);
    const actual = actualByDate.get(key) || 0;
    const predicted = Number(row.predicted_patient_count);
    const error = Math.abs(predicted - actual);
    await query(
      `UPDATE patient_forecasts
       SET actual_patient_count = $1,
           absolute_error = $2,
           squared_error = $3,
           absolute_percentage_error = $4,
           actual_updated_at = NOW(),
           updated_at = NOW()
       WHERE id = $5`,
      [actual, error, error ** 2, actual > 0 ? (error / actual) * 100 : null, row.id],
    );
    updated += 1;
  }
  return updated;
}

