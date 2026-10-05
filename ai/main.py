"""
CareLink AI Insights API (Python 3.14.3)

Serverless-style FastAPI endpoint that answers:
- Where are the most cases?
- Which places have too many requests?
- What are the most common cases?
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Iterator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from insights import analyze_cases
from philippine_context import list_philippine_datasets

load_dotenv()
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "server", ".env"))

app = FastAPI(
    title="CareLink AI Insights",
    version="1.0.0",
    description="Serverless case-intelligence API for CareLink referral analytics.",
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CLIENT_ORIGIN",
        "http://localhost:5173,https://carelink-bay.vercel.app",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class InsightsRequest(BaseModel):
    days: int = Field(default=0, ge=0, le=3650)
    overload_z: float = Field(default=1.0, ge=0.5, le=3.0)


def _database_url() -> str:
    url = (os.getenv("DATABASE_URL") or "").strip()
    if not url:
        raise HTTPException(status_code=500, detail="DATABASE_URL is not configured for the AI service.")
    return url


@contextmanager
def db_connection() -> Iterator[Any]:
    try:
        import psycopg
    except ImportError as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail="psycopg is not installed.") from exc

    try:
        with psycopg.connect(_database_url()) as connection:
            yield connection
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc}") from exc


def fetch_case_rows(days: int) -> list[dict[str, Any]]:
    base_sql = """
        SELECT
            r.id,
            r.referral_code,
            r.referral_reason,
            r.clinical_urgency,
            r.referral_type,
            r.severity_level,
            r.status,
            r.created_at,
            p.city AS patient_city,
            p.province AS patient_province,
            p.address AS patient_address,
            hc_from.name AS referring_center,
            hc_from.type AS referring_center_type,
            hc_to.name AS receiving_center,
            hc_to.type AS receiving_center_type
        FROM referrals r
        JOIN patients p ON p.id = r.patient_id
        JOIN health_centers hc_from ON hc_from.id = r.referring_health_center_id
        JOIN health_centers hc_to ON hc_to.id = r.receiving_health_center_id
    """

    # days <= 0 means analyze the full referrals table
    if days and days > 0:
        sql = base_sql + """
            WHERE r.created_at >= NOW() - (%s * INTERVAL '1 day')
            ORDER BY r.created_at DESC
        """
        params: tuple[Any, ...] = (days,)
    else:
        sql = base_sql + " ORDER BY r.created_at DESC"
        params = ()

    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            columns = [col.name for col in cursor.description]
            return [dict(zip(columns, row, strict=True)) for row in cursor.fetchall()]


@app.get("/health")
def health() -> dict[str, str | int]:
    return {
        "status": "ok",
        "service": "CareLink AI Insights",
        "runtime": "python-3.14.3",
        "data_source": "database",
        "philippine_datasets": len(list_philippine_datasets()),
    }


@app.get("/datasets")
def get_datasets() -> dict[str, Any]:
    datasets = list_philippine_datasets()
    return {
        "geography": "Philippines",
        "focus": "Koronadal City, South Cotabato, SOCCSKSARGEN",
        "count": len(datasets),
        "datasets": datasets,
    }


@app.get("/insights")
def get_insights(
    days: int = Query(default=0, ge=0, le=3650),
    overload_z: float = Query(default=1.0, ge=0.5, le=3.0),
) -> dict[str, Any]:
    rows = fetch_case_rows(days)
    result = analyze_cases(rows, overload_z=overload_z)
    result["source"] = "database"
    result["data_source"] = "supabase"
    result["scope"] = f"last_{days}_days" if days > 0 else "all_referrals"
    result["window_days"] = days if days > 0 else None
    return result


@app.post("/insights")
def post_insights(payload: InsightsRequest) -> dict[str, Any]:
    rows = fetch_case_rows(payload.days)
    result = analyze_cases(rows, overload_z=payload.overload_z)
    result["source"] = "database"
    result["data_source"] = "supabase"
    result["scope"] = f"last_{payload.days}_days" if payload.days > 0 else "all_referrals"
    result["window_days"] = payload.days if payload.days > 0 else None
    return result


# Vercel / serverless ASGI entrypoint
handler = app
