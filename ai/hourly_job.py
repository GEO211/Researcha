"""Hourly predictive analysis for CareLink referral volume.

Collects referral rows from Postgres, builds an hourly series in Philippine
time, and scores the latest complete hour with a saved
HistGradientBoostingRegressor. Training is a separate command.
"""

from __future__ import annotations

import json
import math
import os
import sys
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlparse

import numpy as np
from dotenv import load_dotenv
from psycopg.types.json import Json

ROOT = Path(__file__).resolve().parents[1]
AI_DIR = Path(__file__).resolve().parent
MODEL_PATH = AI_DIR / "models" / "hourly_volume.joblib"
MANILA = timezone(timedelta(hours=8))
ADVISORY_LOCK = 842016
MIN_HISTORY_HOURS = 24 * 14
HOLDOUT_HOURS = 24 * 7
RETRAIN_NEW_REFERRALS = 48
RETRAIN_MIN_HOURS = 12

FEATURE_NAMES = (
    "hour",
    "dow",
    "is_weekend",
    "lag1",
    "lag2",
    "lag3",
    "lag24",
    "lag168",
    "roll24",
    "roll168",
    "prev_emergency",
    "prev_urgent",
    "prev_locations",
)


def debug_enabled() -> bool:
    return os.getenv("AI_DEBUG", "false").strip().lower() in {"1", "true", "yes", "on"}


def log(message: str) -> None:
    print(f"[hourly-ai] {message}", flush=True)


def debug(message: str) -> None:
    if debug_enabled():
        log(message)


def manila_now() -> datetime:
    return datetime.now(MANILA)


def floor_hour(moment: datetime) -> datetime:
    return moment.astimezone(MANILA).replace(minute=0, second=0, microsecond=0)


def iso(moment: datetime) -> str:
    return moment.astimezone(MANILA).isoformat()


def clock(moment: datetime) -> str:
    return moment.astimezone(MANILA).strftime("%I:%M %p").lstrip("0")


def database_urls() -> list[str]:
    load_dotenv(ROOT / "server" / ".env")
    load_dotenv(AI_DIR / ".env")
    password = os.getenv("SUPABASE_DB_PASSWORD", "").strip()
    supabase_url = os.getenv("SUPABASE_URL", "https://oejvlgmoxefwwawqdpwo.supabase.co")
    ref = urlparse(supabase_url).hostname.split(".")[0]
    host = (os.getenv("SUPABASE_DB_POOLER_HOST") or "aws-1-ap-southeast-1.pooler.supabase.com").strip()
    user = quote(f"postgres.{ref}")
    secret = quote(password)
    urls = []
    if password:
        urls.append(f"postgresql://{user}:{secret}@{host}:6543/postgres?sslmode=require")
    database_url = (os.getenv("DATABASE_URL") or "").strip()
    if database_url:
        urls.append(database_url)
    if not urls:
        raise RuntimeError("Database credentials missing. Set SUPABASE_DB_PASSWORD in server/.env.")
    return urls


def connect():
    import psycopg

    errors = []
    for url in database_urls():
        try:
            return psycopg.connect(url, connect_timeout=12)
        except Exception as exc:  # noqa: BLE001
            errors.append(str(exc))
    raise RuntimeError("Could not reach Postgres. " + " | ".join(errors[:2]))


def ensure_schema(connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_hourly_analysis (
          id BIGSERIAL PRIMARY KEY,
          analysis_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          period_start TIMESTAMPTZ NOT NULL,
          period_end TIMESTAMPTZ NOT NULL,
          status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
          error_message TEXT,
          records_analyzed INT NOT NULL DEFAULT 0,
          current_value NUMERIC(12, 2),
          prediction NUMERIC(12, 2),
          prediction_3h NUMERIC(12, 2),
          prediction_6h NUMERIC(12, 2),
          prediction_24h NUMERIC(12, 2),
          confidence NUMERIC(6, 4),
          trend VARCHAR(20),
          anomaly_detected BOOLEAN NOT NULL DEFAULT FALSE,
          anomaly_score NUMERIC(12, 4),
          insight TEXT,
          recommendation TEXT,
          alert_level VARCHAR(20) NOT NULL DEFAULT 'none',
          model_version VARCHAR(40),
          model_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
          comparisons JSONB NOT NULL DEFAULT '{}'::jsonb,
          series JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_ai_hourly_period UNIQUE (period_start)
        )
        """
    )
    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_ai_hourly_analysis_period
          ON ai_hourly_analysis (period_start DESC)
        """
    )
    connection.commit()


def collect_referrals(connection) -> list[dict]:
    rows = connection.execute(
        """
        SELECT
          r.created_at,
          r.clinical_urgency,
          r.referral_type,
          r.severity_level,
          r.status,
          COALESCE(NULLIF(hc.barangay_name, ''), hc.name) AS location
        FROM referrals r
        JOIN health_centers hc ON hc.id = r.referring_health_center_id
        ORDER BY r.created_at ASC
        """
    ).fetchall()
    records = []
    for created_at, urgency, referral_type, severity, status, location in rows:
        moment = created_at.astimezone(MANILA) if created_at.tzinfo else created_at.replace(tzinfo=MANILA)
        records.append({
            "timestamp": moment,
            "clinical_urgency": urgency,
            "referral_type": referral_type,
            "severity_level": severity,
            "status": status,
            "location": location,
        })
    debug(f"dataset source=carelink.referrals rows={len(records)}")
    debug("columns=timestamp, clinical_urgency, referral_type, severity_level, status, location")
    if debug_enabled() and records:
        debug(f"first={iso(records[0]['timestamp'])} last={iso(records[-1]['timestamp'])}")
        for row in records[:3]:
            debug(
                "sample "
                f"time={iso(row['timestamp'])} urgency={row['clinical_urgency']} "
                f"type={row['referral_type']} severity={row['severity_level']} "
                f"status={row['status']} location={row['location']}"
            )
    return records


def build_hourly_series(records: list[dict], end_hour: datetime) -> dict:
    if not records:
        raise RuntimeError("No referral rows are available to analyze.")
    start = floor_hour(records[0]["timestamp"])
    end = floor_hour(end_hour)
    if end < start:
        end = start
    hours = []
    cursor = start
    while cursor <= end:
        hours.append(cursor)
        cursor += timedelta(hours=1)
    index = {hour: i for i, hour in enumerate(hours)}
    arrivals = [0] * len(hours)
    emergency = [0] * len(hours)
    urgent = [0] * len(hours)
    locations = [set() for _ in hours]
    used = 0
    for row in records:
        hour = floor_hour(row["timestamp"])
        if hour not in index:
            continue
        slot = index[hour]
        arrivals[slot] += 1
        used += 1
        if row["clinical_urgency"] == "emergency":
            emergency[slot] += 1
        elif row["clinical_urgency"] == "urgent":
            urgent[slot] += 1
        if row["location"]:
            locations[slot].add(row["location"])
    location_counts = [len(bucket) for bucket in locations]
    active = sum(1 for value in arrivals if value)
    debug(
        f"hourly buckets={len(hours)} active_hours={active} "
        f"referrals_in_grid={used} grid={iso(hours[0])}..{iso(hours[-1])}"
    )
    if debug_enabled():
        shown = 0
        for hour, count, emerg, urg, places in zip(hours, arrivals, emergency, urgent, location_counts):
            if count and shown < 8:
                debug(f"hour {iso(hour)} arrivals={count} emergency={emerg} urgent={urg} locations={places}")
                shown += 1
    return {
        "hours": hours,
        "arrivals": arrivals,
        "emergency": emergency,
        "urgent": urgent,
        "locations": location_counts,
        "referral_count": used,
    }


def feature_row(series: dict, index: int) -> list[float]:
    hours = series["hours"]
    arrivals = series["arrivals"]
    moment = hours[index]

    def lag(steps: int) -> float:
        position = index - steps
        if position < 0:
            return 0.0
        return float(arrivals[position])

    window24 = arrivals[max(0, index - 24):index] or [0]
    window168 = arrivals[max(0, index - 168):index] or [0]
    return [
        moment.hour,
        moment.weekday(),
        1 if moment.weekday() >= 5 else 0,
        lag(1),
        lag(2),
        lag(3),
        lag(24),
        lag(168),
        float(np.mean(window24)),
        float(np.mean(window168)),
        float(series["emergency"][index - 1]) if index else 0.0,
        float(series["urgent"][index - 1]) if index else 0.0,
        float(series["locations"][index - 1]) if index else 0.0,
    ]


def feature_matrix(series: dict) -> tuple[np.ndarray, np.ndarray, list[int]]:
    hours = series["hours"]
    arrivals = series["arrivals"]
    rows = []
    targets = []
    indices = []
    for index in range(168, len(hours)):
        rows.append(feature_row(series, index))
        targets.append(arrivals[index])
        indices.append(index)
    if len(rows) < HOLDOUT_HOURS + 24:
        raise RuntimeError(
            f"Need at least {MIN_HISTORY_HOURS} hourly buckets before training. Found {len(hours)}."
        )
    return np.asarray(rows, dtype=float), np.asarray(targets, dtype=float), indices


def hour_of_day_prediction(arrivals: list[int], hours: list[datetime], index: int, train_until: int) -> float:
    hour = hours[index].hour
    values = [arrivals[i] for i in range(train_until) if hours[i].hour == hour]
    if not values:
        return 0.0
    return float(np.mean(values))


def regression_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict:
    error = predicted - actual
    mae = float(np.mean(np.abs(error)))
    rmse = float(math.sqrt(np.mean(error ** 2)))
    return {"mae": round(mae, 4), "rmse": round(rmse, 4), "samples": int(len(actual))}


def train_model(series: dict, previous: dict | None = None) -> dict:
    from sklearn.ensemble import HistGradientBoostingRegressor

    features, targets, indices = feature_matrix(series)
    split = len(features) - HOLDOUT_HOURS
    model = HistGradientBoostingRegressor(
        max_depth=6,
        learning_rate=0.08,
        max_iter=180,
        l2_regularization=0.1,
        min_samples_leaf=8,
        random_state=7,
    )
    model.fit(features[:split], targets[:split])
    predicted = np.clip(model.predict(features[split:]), 0, None)
    actual = targets[split:]
    metrics = regression_metrics(actual, predicted)
    baseline = np.asarray([
        hour_of_day_prediction(series["arrivals"], series["hours"], index, indices[split])
        for index in indices[split:]
    ], dtype=float)
    baseline_metrics = regression_metrics(actual, baseline)
    metrics["baseline_mae"] = baseline_metrics["mae"]
    metrics["baseline_rmse"] = baseline_metrics["rmse"]
    denom = baseline_metrics["mae"] if baseline_metrics["mae"] > 0 else 1.0
    skill = 1 - (metrics["mae"] / denom)
    metrics["confidence"] = round(max(0.0, min(0.99, skill)), 4)
    metrics["training_rows"] = int(split)
    metrics["holdout_rows"] = int(len(actual))
    metrics["hourly_buckets"] = len(series["hours"])
    metrics["referral_rows"] = series["referral_count"]
    metrics["source"] = "carelink-referrals"
    previous_mae = (previous or {}).get("metrics", {}).get("mae")
    deploy = previous_mae is None or metrics["mae"] <= float(previous_mae)
    version_number = 1
    if previous and previous.get("version", "").startswith("hgb-v"):
        try:
            version_number = int(previous["version"].split("v", 1)[1]) + (1 if deploy else 0)
        except ValueError:
            version_number = 1
    if not deploy:
        log(
            f"kept {previous['version']} because new MAE {metrics['mae']} "
            f"did not beat {previous_mae}"
        )
        return previous
    version = f"hgb-v{version_number}"
    payload = {
        "model": model,
        "version": version,
        "metrics": metrics,
        "feature_names": FEATURE_NAMES,
        "trained_at": iso(manila_now()),
        "trained_through": iso(series["hours"][-1]),
        "referral_count": series["referral_count"],
        "source": "carelink-referrals",
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    import joblib
    joblib.dump(payload, MODEL_PATH)
    log(
        f"trained {version} mae={metrics['mae']} rmse={metrics['rmse']} "
        f"baseline_mae={metrics['baseline_mae']} confidence={metrics['confidence']}"
    )
    return payload


def load_model() -> dict | None:
    if not MODEL_PATH.exists():
        return None
    import joblib
    return joblib.load(MODEL_PATH)


def should_retrain(payload: dict | None, referral_count: int) -> bool:
    if payload is None:
        return True
    trained_at = datetime.fromisoformat(payload["trained_at"])
    age_hours = (manila_now() - trained_at).total_seconds() / 3600
    new_rows = referral_count - int(payload.get("referral_count") or 0)
    return age_hours >= RETRAIN_MIN_HOURS and new_rows >= RETRAIN_NEW_REFERRALS


def hod_means(series: dict) -> dict[int, dict[str, float]]:
    buckets = {hour: {"arrivals": [], "emergency": [], "urgent": [], "locations": []} for hour in range(24)}
    for index, moment in enumerate(series["hours"]):
        bucket = buckets[moment.hour]
        bucket["arrivals"].append(series["arrivals"][index])
        bucket["emergency"].append(series["emergency"][index])
        bucket["urgent"].append(series["urgent"][index])
        bucket["locations"].append(series["locations"][index])
    means = {}
    for hour, bucket in buckets.items():
        means[hour] = {
            key: float(np.mean(values)) if values else 0.0
            for key, values in bucket.items()
        }
    return means


def predict_path(payload: dict, series: dict, steps: int) -> list[float]:
    model = payload["model"]
    hours = list(series["hours"])
    arrivals = list(series["arrivals"])
    emergency = list(series["emergency"])
    urgent = list(series["urgent"])
    locations = list(series["locations"])
    means = hod_means(series)
    forecasts = []
    for _ in range(steps):
        next_hour = hours[-1] + timedelta(hours=1)
        hours.append(next_hour)
        emergency.append(means[hours[-2].hour]["emergency"])
        urgent.append(means[hours[-2].hour]["urgent"])
        locations.append(means[hours[-2].hour]["locations"])
        arrivals.append(0)
        row = feature_row({
            "hours": hours,
            "arrivals": arrivals,
            "emergency": emergency,
            "urgent": urgent,
            "locations": locations,
        }, len(hours) - 1)
        expected = max(0.0, float(model.predict(np.asarray([row], dtype=float))[0]))
        arrivals[-1] = expected
        forecasts.append(expected)
    return forecasts


def round_number(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 2)


def percent_change(current: float, reference: float | None) -> float | None:
    if reference is None:
        return None
    base = max(abs(reference), 1.0)
    return round(((current - reference) / base) * 100, 1)


def classify_trend(current: float, previous: float | None, anomaly: bool) -> str:
    if anomaly:
        return "unusual"
    if previous is None:
        return "stable"
    delta = current - previous
    ratio = delta / max(previous, 1.0)
    if abs(delta) < 1 and abs(ratio) < 0.15:
        return "stable"
    if ratio >= 0.15:
        return "increasing"
    if ratio <= -0.15:
        return "decreasing"
    return "stable"


def value_at(series: dict, index: int) -> float | None:
    if index < 0 or index >= len(series["arrivals"]):
        return None
    return float(series["arrivals"][index])


def build_insight(period_start: datetime, current: float, comparisons: dict, trend: str, anomaly: bool, prediction: float) -> str:
    parts = [f"The hour ending {clock(period_start + timedelta(hours=1))} recorded {round_number(current)} referrals."]
    yesterday = comparisons.get("same_hour_yesterday")
    average = comparisons.get("historical_average")
    if yesterday is not None and yesterday["change_percent"] is not None:
        change = yesterday["change_percent"]
        if change == 0:
            parts.append(f"That matches the same hour yesterday ({round_number(yesterday['value'])}).")
        else:
            direction = "above" if change > 0 else "below"
            parts.append(
                f"That is {abs(change)}% {direction} the same hour yesterday ({round_number(yesterday['value'])})."
            )
    if average is not None:
        parts.append(f"The historical average for this clock hour is {round_number(average['value'])}.")
    parts.append(f"Trend: {trend}.")
    parts.append(f"The model expects {round_number(prediction)} referrals in the next hour.")
    if anomaly:
        parts.append("This hour is outside the model's normal error range.")
    return " ".join(parts)


def build_recommendation(trend: str, anomaly: bool, alert: str) -> str:
    if alert == "warning" or anomaly:
        return "Staff the receiving center for a heavier next hour and watch emergency referrals."
    if trend == "increasing":
        return "Prepare for more arrivals over the next few hours."
    if trend == "decreasing":
        return "Current arrival pressure is easing. Keep routine staffing."
    return "Arrival volume is close to the recent pattern. Continue routine monitoring."


def analysis_series(series: dict, payload: dict, forecasts: list[float], anomaly_index: int) -> list[dict]:
    means = hod_means(series)
    points = []
    start = max(0, len(series["hours"]) - 24)
    model = payload["model"]
    for index in range(start, len(series["hours"])):
        moment = series["hours"][index]
        predicted = None
        if index >= 168:
            row = feature_row(series, index)
            predicted = round_number(max(0.0, float(model.predict(np.asarray([row], dtype=float))[0])))
        points.append({
            "time": iso(moment),
            "actual": series["arrivals"][index],
            "average": round_number(means[moment.hour]["arrivals"]),
            "predicted": predicted,
            "anomaly": index == anomaly_index,
        })
    cursor = series["hours"][-1]
    for expected in forecasts[:6]:
        cursor += timedelta(hours=1)
        points.append({
            "time": iso(cursor),
            "actual": None,
            "average": round_number(means[cursor.hour]["arrivals"]),
            "predicted": round_number(expected),
            "anomaly": False,
        })
    return points


def save_analysis(connection, row: dict) -> None:
    connection.execute(
        """
        INSERT INTO ai_hourly_analysis (
          analysis_time, period_start, period_end, status, error_message,
          records_analyzed, current_value, prediction, prediction_3h, prediction_6h,
          prediction_24h, confidence, trend, anomaly_detected, anomaly_score,
          insight, recommendation, alert_level, model_version, model_metrics,
          comparisons, series
        ) VALUES (
          %(analysis_time)s, %(period_start)s, %(period_end)s, %(status)s, %(error_message)s,
          %(records_analyzed)s, %(current_value)s, %(prediction)s, %(prediction_3h)s, %(prediction_6h)s,
          %(prediction_24h)s, %(confidence)s, %(trend)s, %(anomaly_detected)s, %(anomaly_score)s,
          %(insight)s, %(recommendation)s, %(alert_level)s, %(model_version)s, %(model_metrics)s,
          %(comparisons)s, %(series)s
        )
        ON CONFLICT (period_start) DO UPDATE SET
          analysis_time = EXCLUDED.analysis_time,
          period_end = EXCLUDED.period_end,
          status = EXCLUDED.status,
          error_message = EXCLUDED.error_message,
          records_analyzed = EXCLUDED.records_analyzed,
          current_value = EXCLUDED.current_value,
          prediction = EXCLUDED.prediction,
          prediction_3h = EXCLUDED.prediction_3h,
          prediction_6h = EXCLUDED.prediction_6h,
          prediction_24h = EXCLUDED.prediction_24h,
          confidence = EXCLUDED.confidence,
          trend = EXCLUDED.trend,
          anomaly_detected = EXCLUDED.anomaly_detected,
          anomaly_score = EXCLUDED.anomaly_score,
          insight = EXCLUDED.insight,
          recommendation = EXCLUDED.recommendation,
          alert_level = EXCLUDED.alert_level,
          model_version = EXCLUDED.model_version,
          model_metrics = EXCLUDED.model_metrics,
          comparisons = EXCLUDED.comparisons,
          series = EXCLUDED.series
        WHERE ai_hourly_analysis.status = 'failed'
        """,
        {
            **row,
            "model_metrics": Json(row["model_metrics"]),
            "comparisons": Json(row["comparisons"]),
            "series": Json(row["series"]),
        },
    )
    connection.commit()


def existing_success(connection, period_start: datetime):
    return connection.execute(
        """
        SELECT id FROM ai_hourly_analysis
        WHERE period_start = %s AND status = 'success'
        LIMIT 1
        """,
        (period_start,),
    ).fetchone()


def run_analysis(connection, retrain: bool = False) -> None:
    locked = connection.execute("SELECT pg_try_advisory_lock(%s)", (ADVISORY_LOCK,)).fetchone()[0]
    if not locked:
        log("another hourly analysis is already running")
        return
    try:
        period_end = floor_hour(manila_now())
        period_start = period_end - timedelta(hours=1)
        if existing_success(connection, period_start):
            log(f"{clock(period_start)} already analyzed")
            return
        records = collect_referrals(connection)
        series = build_hourly_series(records, period_start)
        payload = load_model()
        if retrain or should_retrain(payload, series["referral_count"]):
            payload = train_model(series, payload)
        if payload is None:
            raise RuntimeError("No trained model is available.")
        index = len(series["hours"]) - 1
        current = float(series["arrivals"][index])
        one_step = feature_row(series, index)
        expected_now = max(0.0, float(payload["model"].predict(np.asarray([one_step], dtype=float))[0]))
        rmse = float(payload["metrics"].get("rmse") or 1)
        residual = current - expected_now
        anomaly_score = abs(residual) / rmse if rmse else 0.0
        anomaly = anomaly_score >= 2.5 and abs(residual) >= 3
        previous = value_at(series, index - 1)
        yesterday = value_at(series, index - 24)
        last_week = value_at(series, index - 168)
        same_hour_values = [
            series["arrivals"][i]
            for i, moment in enumerate(series["hours"][:-1])
            if moment.hour == series["hours"][index].hour
        ]
        historical_average = float(np.mean(same_hour_values)) if same_hour_values else None
        historical_p95 = float(np.percentile(same_hour_values, 95)) if same_hour_values else None
        forecasts = predict_path(payload, series, 24)
        next_hour = forecasts[0]
        trend = classify_trend(current, previous, anomaly)
        alert = "warning" if anomaly or (
            historical_p95 is not None and next_hour > max(historical_p95, (historical_average or 0) + 2)
        ) else "none"
        comparisons = {
            "previous_hour": {"value": previous, "change_percent": percent_change(current, previous)},
            "same_hour_yesterday": {"value": yesterday, "change_percent": percent_change(current, yesterday)},
            "same_hour_last_week": {"value": last_week, "change_percent": percent_change(current, last_week)},
            "historical_average": {"value": round_number(historical_average), "change_percent": percent_change(current, historical_average)},
            "model_expected": round_number(expected_now),
        }
        row = {
            "analysis_time": manila_now(),
            "period_start": period_start,
            "period_end": period_end,
            "status": "success",
            "error_message": None,
            "records_analyzed": series["referral_count"],
            "current_value": round_number(current),
            "prediction": round_number(next_hour),
            "prediction_3h": round_number(sum(forecasts[:3])),
            "prediction_6h": round_number(sum(forecasts[:6])),
            "prediction_24h": round_number(sum(forecasts)),
            "confidence": payload["metrics"].get("confidence"),
            "trend": trend,
            "anomaly_detected": anomaly,
            "anomaly_score": round(anomaly_score, 3),
            "insight": build_insight(period_start, current, comparisons, trend, anomaly, next_hour),
            "recommendation": build_recommendation(trend, anomaly, alert),
            "alert_level": alert,
            "model_version": payload["version"],
            "model_metrics": payload["metrics"],
            "comparisons": comparisons,
            "series": analysis_series(series, payload, forecasts, index if anomaly else -1),
        }
        save_analysis(connection, row)
        log(
            f"saved {iso(period_start)} trend={trend} prediction={row['prediction']} "
            f"confidence={row['confidence']} anomaly={anomaly}"
        )
        if debug_enabled():
            debug("saved comparisons " + json.dumps(comparisons, default=str))
    finally:
        connection.execute("SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK,))
        connection.commit()


def save_failure(period_start: datetime, period_end: datetime, message: str) -> None:
    try:
        with connect() as connection:
            ensure_schema(connection)
            if existing_success(connection, period_start):
                return
            save_analysis(connection, {
                "analysis_time": manila_now(),
                "period_start": period_start,
                "period_end": period_end,
                "status": "failed",
                "error_message": message[:2000],
                "records_analyzed": 0,
                "current_value": None,
                "prediction": None,
                "prediction_3h": None,
                "prediction_6h": None,
                "prediction_24h": None,
                "confidence": None,
                "trend": None,
                "anomaly_detected": False,
                "anomaly_score": None,
                "insight": None,
                "recommendation": None,
                "alert_level": "none",
                "model_version": None,
                "model_metrics": {},
                "comparisons": {},
                "series": [],
            })
    except Exception as exc:  # noqa: BLE001
        log(f"could not store the failure: {exc}")


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else "analyze"
    debug(f"AI_DEBUG={os.getenv('AI_DEBUG', 'false')} command={command}")
    period_end = floor_hour(manila_now())
    period_start = period_end - timedelta(hours=1)
    try:
        with connect() as connection:
            ensure_schema(connection)
            if command == "train":
                records = collect_referrals(connection)
                series = build_hourly_series(records, period_start)
                train_model(series, load_model())
                return 0
            if command != "analyze":
                raise RuntimeError("Use analyze or train.")
            run_analysis(connection, retrain=False)
            return 0
    except Exception as exc:  # noqa: BLE001
        log(f"failed: {exc}")
        if debug_enabled():
            traceback.print_exc()
        save_failure(period_start, period_end, str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
