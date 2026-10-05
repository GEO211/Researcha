"""Philippine public-health datasets used by CareLink case intelligence."""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

# Philippines does not observe daylight saving, so a fixed UTC+8 offset
# works on Windows without the tzdata package.
MANILA = timezone(timedelta(hours=8))

DATA_PATH = Path(__file__).resolve().parents[1] / "shared" / "philippineDatasets.json"
MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

with DATA_PATH.open(encoding="utf-8") as handle:
    _DATA = json.load(handle)


def _dataset(dataset_id: str) -> dict[str, Any]:
    for item in _DATA["datasets"]:
        if item["id"] == dataset_id:
            return item
    raise KeyError(dataset_id)


def list_philippine_datasets() -> list[dict[str, Any]]:
    return [
        {
            "id": item["id"],
            "title": item["title"],
            "publisher": item["publisher"],
            "year": item["year"],
            "geography": item["geography"],
            "description": item["description"],
            "source_url": item["source_url"],
            "source_note": item["source_note"],
            "record_count": len(item["records"]),
        }
        for item in _DATA["datasets"]
    ]


def normalize_place_key(value: str | None) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = text.lower()
    text = re.sub(r"^brgy\.?\s+", "", text)
    text = re.sub(r"^barangay\s+", "", text)
    text = re.sub(r"\s+health\s+center$", "", text)
    text = re.sub(r"\s+city\s+health\s+center$", "", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def _barangay_index() -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for row in _dataset("psa-2020-koronadal-barangays")["records"]:
        index[normalize_place_key(row["name"])] = row
        for alias in row.get("aliases") or []:
            index[normalize_place_key(alias)] = row
    return index


_BARANGAYS = _barangay_index()


def match_koronadal_barangay(value: str | None) -> dict[str, Any] | None:
    key = normalize_place_key(value)
    if not key:
        return None
    return _BARANGAYS.get(key)


def _keyword_hit(text: str, keyword: str) -> bool:
    needle = str(keyword or "").lower().strip()
    if not needle:
        return False
    if needle.endswith(" "):
        return needle in text
    pattern = rf"(?:^|[^a-z0-9]){re.escape(needle)}(?:[^a-z0-9]|$)"
    return re.search(pattern, text, flags=re.IGNORECASE) is not None


def _matched_keywords(text: str, keywords: list[str]) -> list[str]:
    return [keyword for keyword in keywords if _keyword_hit(text, keyword)]


def _population_adjusted(barangay_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked: list[dict[str, Any]] = []
    for index, row in enumerate(barangay_rows):
        match = match_koronadal_barangay(row.get("label"))
        if not match:
            continue
        cases = int(row.get("count") or 0)
        ranked.append({
            "label": row.get("label"),
            "psa_name": match["name"],
            "cases": cases,
            "population_2020": match["population_2020"],
            "cases_per_1000": round((cases / match["population_2020"]) * 1000, 2),
            "population_share_percent": match["share_percent"],
            "raw_rank": index + 1,
        })
    ranked.sort(key=lambda item: (item["cases_per_1000"], item["cases"]), reverse=True)
    return [{**row, "rate_rank": index + 1} for index, row in enumerate(ranked)]


def build_philippine_context(
    barangay_rows: list[dict[str, Any]] | None = None,
    reason_text: str = "",
    at: datetime | None = None,
) -> dict[str, Any]:
    moment = at or datetime.now(timezone.utc)
    manila = moment.astimezone(MANILA)
    month = manila.month
    text = str(reason_text or "").lower()
    geography = _dataset("psa-2020-geography")["records"]
    city = next(row for row in geography if row["name"] == "Koronadal City")
    adjusted = _population_adjusted(barangay_rows or [])[:5]
    top_rate = adjusted[0] if adjusted else None
    raw_row = (barangay_rows or [None])[0]
    raw_leader = match_koronadal_barangay(raw_row.get("label")) if raw_row else None
    rate_changes_rank = bool(top_rate and raw_leader and top_rate["psa_name"] != raw_leader["name"])

    matched_programs = []
    for program in _dataset("doh-primary-care-programs")["records"]:
        hits = _matched_keywords(text, program["keywords"])
        if hits:
            matched_programs.append({
                "id": program["id"],
                "name": program["name"],
                "agency": program["agency"],
                "action": program["action"],
                "matched_keywords": hits,
            })

    notifiable = []
    for disease in _dataset("doh-pidsr")["records"]:
        hits = _matched_keywords(text, disease["keywords"])
        if hits:
            notifiable.append({
                "name": disease["name"],
                "category": disease["category"],
                "matched_keywords": hits,
            })

    seasonal = []
    for risk in _dataset("pagasa-seasonal-health")["records"]:
        seen = _matched_keywords(text, risk["keywords"])
        if not seen:
            continue
        in_peak = month in risk["peak_months"]
        seasonal.append({
            "condition": risk["condition"],
            "level": "elevated" if in_peak else "off-peak",
            "seen_locally": True,
            "guidance": risk["guidance"],
        })

    morbidity = []
    for row in _dataset("doh-fhsis-r12-2025")["records"]:
        seen = _matched_keywords(text, row["keywords"])
        if not seen:
            continue
        morbidity.append({
            "rank": row["rank"],
            "condition": row["condition"],
            "cases": row.get("cases"),
            "local_match": True,
            "note": f"{row['cases']:,} SOCCSKSARGEN cases in December 2025.",
        })

    recommendations: list[str] = []
    if rate_changes_rank and top_rate:
        recommendations.append(
            f"{top_rate['psa_name']} leads once referrals are divided by barangay population: "
            f"{top_rate['cases_per_1000']} cases per 1,000 residents."
        )
    if matched_programs:
        recommendations.append(matched_programs[0]["action"])
    active = next((risk for risk in seasonal if risk["level"] == "elevated"), None)
    if active:
        recommendations.append(f"{MONTHS[month - 1]} watch for {active['condition']}: {active['guidance']}")
    if notifiable:
        recommendations.append(
            f"{notifiable[0]['name']} appears in current referrals. Confirm whether it needs a "
            f"{notifiable[0]['category']} PIDSR report."
        )

    summary_parts: list[str] = []
    if rate_changes_rank and top_rate:
        summary_parts.append(
            f"{top_rate['psa_name']} is not the largest raw caseload, but it has the highest rate "
            f"at {top_rate['cases_per_1000']} referrals per 1,000 residents."
        )
    if morbidity:
        summary_parts.append(
            f"{morbidity[0]['condition']} is also in the December 2025 SOCCSKSARGEN morbidity list "
            f"({morbidity[0]['note']})"
        )
    summary = " ".join(summary_parts)

    return {
        "timezone": "Asia/Manila",
        "month": month,
        "month_name": MONTHS[month - 1],
        "summary": summary,
        "show": bool(rate_changes_rank or notifiable or seasonal or morbidity),
        "city_population_2024": city["population_2024"],
        "population_adjusted_barangays": adjusted if rate_changes_rank else [],
        "matched_programs": matched_programs[:6],
        "notifiable_matches": notifiable[:6],
        "seasonal_watch": seasonal,
        "national_morbidity_alignment": morbidity,
        "recommendations": recommendations,
    }
