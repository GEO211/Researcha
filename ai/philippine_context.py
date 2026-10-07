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


def _latest_in_series(series: str) -> dict[str, Any]:
    matches = [item for item in _DATA["datasets"] if item.get("series") == series]
    if not matches:
        raise KeyError(series)
    return max(matches, key=lambda item: str(item.get("as_of") or ""))


def _latest_population(row: dict[str, Any]) -> dict[str, int] | None:
    vintages = []
    for key, value in row.items():
        if key.startswith("population_") and key[11:].isdigit() and isinstance(value, int):
            vintages.append({"year": int(key[11:]), "value": value})
    if not vintages:
        return None
    return max(vintages, key=lambda item: item["year"])


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
            "as_of": item.get("as_of"),
            "checked_on": item.get("checked_on") or _DATA.get("checked_on"),
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
    for row in _latest_in_series("psa-koronadal-barangays")["records"]:
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
        population = _latest_population(match) if match else None
        if not match or not population:
            continue
        cases = int(row.get("count") or 0)
        ranked.append({
            "label": row.get("label"),
            "psa_name": match["name"],
            "cases": cases,
            "population": population["value"],
            "population_year": population["year"],
            "cases_per_1000": round((cases / population["value"]) * 1000, 2),
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
    as_of_label = f"{manila.day} {MONTHS[month - 1]} {manila.year}"
    text = str(reason_text or "").lower()
    geography = _latest_in_series("psa-geography")
    city = next(row for row in geography["records"] if row["name"] == "Koronadal City")
    city_population = _latest_population(city)
    adjusted = _population_adjusted(barangay_rows or [])[:5]
    top_rate = adjusted[0] if adjusted else None
    raw_row = (barangay_rows or [None])[0]
    raw_leader = match_koronadal_barangay(raw_row.get("label")) if raw_row else None
    rate_changes_rank = bool(top_rate and raw_leader and top_rate["psa_name"] != raw_leader["name"])

    matched_programs = []
    for program in _latest_in_series("doh-primary-care-programs")["records"]:
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
    for disease in _latest_in_series("doh-pidsr")["records"]:
        hits = _matched_keywords(text, disease["keywords"])
        if hits:
            notifiable.append({
                "name": disease["name"],
                "category": disease["category"],
                "matched_keywords": hits,
            })

    seasonal = []
    for risk in _latest_in_series("pagasa-seasonal-health")["records"]:
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
    morbidity_set = _latest_in_series("doh-morbidity-r12")
    for row in morbidity_set["records"]:
        seen = _matched_keywords(text, row["keywords"])
        if not seen:
            continue
        morbidity.append({
            "rank": row["rank"],
            "condition": row["condition"],
            "cases": row.get("cases"),
            "local_match": True,
            "note": (
                f"{row['cases']:,} {morbidity_set['geography']} cases, compared on {as_of_label}."
            ),
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
            f"{morbidity[0]['condition']} is also on the latest {morbidity_set['geography']} morbidity list, "
            f"compared on {as_of_label}."
        )
    summary = " ".join(summary_parts)

    return {
        "timezone": "Asia/Manila",
        "as_of_label": as_of_label,
        "month": month,
        "month_name": MONTHS[month - 1],
        "summary": summary,
        "show": bool(rate_changes_rank or notifiable or seasonal or morbidity),
        "catalog_checked_on": _DATA.get("checked_on"),
        "city_population": city_population["value"] if city_population else None,
        "city_population_year": city_population["year"] if city_population else None,
        "population_adjusted_barangays": adjusted if rate_changes_rank else [],
        "matched_programs": matched_programs[:6],
        "notifiable_matches": notifiable[:6],
        "seasonal_watch": seasonal,
        "national_morbidity_alignment": morbidity,
        "recommendations": recommendations,
    }
