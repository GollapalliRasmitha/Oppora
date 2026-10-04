"""
The weekly digest: a summary of the user's own data, nothing invented.
Opportunities are dicts in API shape (core.data.opportunity_dicts).
"""

from datetime import timedelta

from .constants import SOON_WINDOW_DAYS
from .dates import days_left, is_within_last_week, short_date
from .insights import js_round
from .match import match_sentence
from .stats import active, upcoming_deadlines


def _status(o):
    return o["application"]["status"] if o["application"] else None


def _brief(o: dict, now) -> dict:
    return {
        "id": o["id"],
        "title": o["title"],
        "organization": o["organization"],
        "type": o["type"],
        "deadline": o["deadline"],
        "daysLeft": days_left(o["deadline"], now),
        "matchScore": o["matchScore"],
        "fee": o.get("fee"),
    }


def compute_digest(opps: list[dict], now) -> dict:
    items = active(opps)
    week_start = now.date() - timedelta(days=now.weekday())  # Monday
    new = sorted((o for o in items if is_within_last_week(o["discoveredAt"], now)), key=lambda o: -o["matchScore"])
    candidates = [
        o for o in items
        if _status(o) != "applied" and ((d := days_left(o["deadline"], now)) is None or d >= 0) and not o.get("fee")
    ]  # fmt: skip
    top = sorted(candidates, key=lambda o: -o["matchScore"])[:3]
    fees = [o for o in items if o.get("fee")]
    applied = sum(1 for o in items if _status(o) == "applied")
    in_progress = sum(1 for o in items if _status(o) == "in_progress")
    saved = sum(1 for o in items if o["saved"] and not o["application"])
    total = len(items)
    return {
        "weekOf": week_start.isoformat(),
        "weekLabel": f"Week of {short_date(week_start)}",
        "newThisWeek": [_brief(o, now) for o in new],
        "topMatches": [
            {**_brief(o, now), "why": match_sentence(o["matchReasons"]), "matchReasons": o["matchReasons"]} for o in top
        ],
        "deadlinesSoon": [_brief(o, now) for o in upcoming_deadlines(items, now, SOON_WINDOW_DAYS)],
        "feeWarnings": [_brief(o, now) for o in fees],
        "progress": {
            "applied": applied,
            "inProgress": in_progress,
            "saved": saved,
            "total": total,
            "appliedPercent": js_round(applied / total * 100) if total else 0,
        },
    }


def digest_summary(d: dict) -> str:
    """One line for the bell notification."""
    parts = []
    if n := len(d["newThisWeek"]):
        parts.append(f"{n} new {'opportunity' if n == 1 else 'opportunities'}")
    if n := len(d["deadlinesSoon"]):
        parts.append(f"{n} {'deadline' if n == 1 else 'deadlines'} in the next 7 days")
    if d["topMatches"]:
        parts.append(f"top match: {d['topMatches'][0]['title']}")
    if not parts:
        return "A quiet week: nothing new. Your progress is inside."
    line = "; ".join(parts) + "."
    return line[0].upper() + line[1:]  # not str.capitalize(): that would lowercase names
