"""CareLink AI case-intelligence helpers (hotspots, overload, top case types)."""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

STOPWORDS = {
    "a", "an", "the", "and", "or", "of", "to", "for", "in", "on", "at", "with",
    "is", "are", "was", "were", "be", "been", "this", "that", "from", "by",
    "as", "it", "patient", "referral", "check", "follow", "up", "due", "needs",
}


def _safe_div(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def _mean(values: list[float]) -> float:
    return _safe_div(sum(values), len(values))


def _stdev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    avg = _mean(values)
    variance = _safe_div(sum((value - avg) ** 2 for value in values), len(values))
    return math.sqrt(variance)


def _pct(part: int, whole: int) -> float:
    return round(_safe_div(part, whole) * 100, 1)


def _rank_counter(counter: Counter[str], total: int, limit: int = 10) -> list[dict[str, Any]]:
    return [
        {
            "label": label,
            "count": count,
            "share_percent": _pct(count, total),
        }
        for label, count in counter.most_common(limit)
        if label
    ]


def _extract_reason_themes(reasons: list[str], limit: int = 8) -> list[dict[str, Any]]:
    tokens: list[str] = []
    for reason in reasons:
        words = re.findall(r"[a-zA-Z]{3,}", reason.lower())
        tokens.extend(word for word in words if word not in STOPWORDS)

    counts = Counter(tokens)
    total = sum(counts.values()) or 1
    return [
        {
            "theme": word,
            "mentions": count,
            "share_percent": _pct(count, total),
        }
        for word, count in counts.most_common(limit)
    ]


def _normalize_city(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "Unknown city"
    compact = re.sub(r"\s+", " ", raw).strip().lower()
    # CareLink operates in Koronadal City — merge naming variants.
    if compact in {"koronadal", "koronadal city", "city of koronadal", "koronadal city, south cotabato"}:
        return "Koronadal City"
    if compact.startswith("koronadal"):
        return "Koronadal City"
    return raw


def analyze_cases(rows: list[dict[str, Any]], overload_z: float = 1.0) -> dict[str, Any]:
    """
    Analyze referral rows and return:
    - where most cases are (by barangay / city / referring center)
    - places with too many requests (overloaded centers)
    - what the most common cases are
    """
    total = len(rows)
    now = datetime.now(timezone.utc)

    by_referring = Counter()
    by_receiving = Counter()
    by_city = Counter()
    by_barangay = Counter()
    by_type = Counter()
    by_urgency = Counter()
    by_severity = Counter()
    reasons: list[str] = []
    center_meta: dict[str, dict[str, Any]] = {}

    for row in rows:
        referring = row.get("referring_center") or "Unknown barangay"
        receiving = row.get("receiving_center") or "Unknown city center"
        city = _normalize_city(row.get("patient_city"))
        barangay = row.get("referring_center") or "Unknown barangay"

        by_referring[referring] += 1
        by_receiving[receiving] += 1
        by_city[city] += 1
        by_barangay[barangay] += 1
        by_type[str(row.get("referral_type") or "unknown")] += 1
        by_urgency[str(row.get("clinical_urgency") or "unknown")] += 1
        by_severity[str(row.get("severity_level") or "unknown")] += 1

        reason = str(row.get("referral_reason") or "").strip()
        if reason:
            reasons.append(reason)

        center_meta[referring] = {
            "place": referring,
            "place_type": "barangay",
            "count": by_referring[referring],
        }
        center_meta[receiving] = {
            "place": receiving,
            "place_type": "city_center",
            "count": by_receiving[receiving],
        }

    referring_counts = list(by_referring.values())
    receiving_counts = list(by_receiving.values())
    referring_mean = _mean([float(v) for v in referring_counts]) if referring_counts else 0.0
    referring_std = _stdev([float(v) for v in referring_counts]) if referring_counts else 0.0
    receiving_mean = _mean([float(v) for v in receiving_counts]) if receiving_counts else 0.0
    receiving_std = _stdev([float(v) for v in receiving_counts]) if receiving_counts else 0.0

    overloaded_places: list[dict[str, Any]] = []

    for place, count in by_referring.items():
        threshold = referring_mean + (overload_z * referring_std)
        if count >= max(threshold, referring_mean * 1.5 if referring_mean else 1):
            overloaded_places.append({
                "place": place,
                "place_type": "barangay",
                "request_count": count,
                "share_percent": _pct(count, total),
                "baseline_average": round(referring_mean, 1),
                "overload_score": round(_safe_div(count, referring_mean or 1), 2),
                "reason": "Above-average referral volume from this barangay",
            })

    for place, count in by_receiving.items():
        threshold = receiving_mean + (overload_z * receiving_std)
        if count >= max(threshold, receiving_mean * 1.35 if receiving_mean else 1):
            overloaded_places.append({
                "place": place,
                "place_type": "city_center",
                "request_count": count,
                "share_percent": _pct(count, total),
                "baseline_average": round(receiving_mean, 1),
                "overload_score": round(_safe_div(count, receiving_mean or 1), 2),
                "reason": "Receiving too many referral requests relative to other centers",
            })

    overloaded_places.sort(key=lambda item: item["request_count"], reverse=True)

    hotspots = {
        "by_barangay": _rank_counter(by_barangay, total, 10),
        "by_city": _rank_counter(by_city, total, 10),
        "by_referring_center": _rank_counter(by_referring, total, 10),
        "by_receiving_center": _rank_counter(by_receiving, total, 10),
    }

    most_cases = {
        "by_referral_type": _rank_counter(by_type, total, 10),
        "by_clinical_urgency": _rank_counter(by_urgency, total, 10),
        "by_severity": _rank_counter(by_severity, total, 10),
        "reason_themes": _extract_reason_themes(reasons),
    }

    top_place = hotspots["by_barangay"][0]["label"] if hotspots["by_barangay"] else "N/A"
    top_case = most_cases["by_referral_type"][0]["label"] if most_cases["by_referral_type"] else "N/A"
    top_urgency = most_cases["by_clinical_urgency"][0]["label"] if most_cases["by_clinical_urgency"] else "N/A"
    overload_names = [item["place"] for item in overloaded_places[:3]]

    narrative = [
        f"Across {total} referral cases, the highest case concentration is in {top_place}.",
        f"The most common case type is {top_case.replace('_', ' ')} with {top_urgency} clinical urgency dominating volume.",
    ]
    if overload_names:
        narrative.append(
            "Places with too many requests: " + ", ".join(overload_names) + "."
        )
    else:
        narrative.append("No place currently exceeds the overload threshold.")

    if most_cases["reason_themes"]:
        themes = ", ".join(item["theme"] for item in most_cases["reason_themes"][:5])
        narrative.append(f"Frequent case themes in referral reasons: {themes}.")

    return {
        "generated_at": now.isoformat(),
        "model": "carelink-case-intelligence-v1",
        "runtime": "python-3.14.3-serverless",
        "total_cases": total,
        "summary": " ".join(narrative),
        "hotspots": hotspots,
        "overloaded_places": overloaded_places,
        "most_cases": most_cases,
        "recommendations": _build_recommendations(hotspots, overloaded_places, most_cases),
    }


def _build_recommendations(
    hotspots: dict[str, list[dict[str, Any]]],
    overloaded_places: list[dict[str, Any]],
    most_cases: dict[str, list[dict[str, Any]]],
) -> list[str]:
    tips: list[str] = []

    if hotspots.get("by_barangay"):
        top = hotspots["by_barangay"][0]
        tips.append(
            f"Prioritize outreach and staffing support for {top['label']} "
            f"({top['count']} cases, {top['share_percent']}% of volume)."
        )

    for place in overloaded_places[:2]:
        tips.append(
            f"Throttle or redistribute load from {place['place']} "
            f"({place['request_count']} requests, overload score {place['overload_score']}x)."
        )

    if most_cases.get("by_clinical_urgency"):
        urgency = most_cases["by_clinical_urgency"][0]
        tips.append(
            f"Prepare protocols for {urgency['label']} cases — currently {urgency['share_percent']}% of referrals."
        )

    if most_cases.get("reason_themes"):
        theme = most_cases["reason_themes"][0]["theme"]
        tips.append(f"Review care pathways related to recurring theme: {theme}.")

    return tips or ["Not enough referral data yet for actionable AI recommendations."]
