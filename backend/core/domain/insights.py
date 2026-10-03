"""AI Insights numbers (port of frontend/lib/domain/insights.ts)."""

import math
from collections import Counter

from .constants import is_opportunity_category
from .dates import WEEKDAYS, add_days, local_date, long_day, short_date
from .stats import active, strong_matches

_SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
TREND_RANGES = (7, 30)


def js_round(x: float) -> int:
    """Math.round semantics (half up); Python's round() is banker's rounding."""
    return math.floor(x + 0.5)


def _top(counts: Counter, order_key):
    """Highest count wins; ties are reported (never silently broken), first in `order_key` shown."""
    entries = sorted(counts.items(), key=lambda kv: (-kv[1], order_key(kv[0])))
    if not entries:
        return None
    key, count = entries[0]
    return {"key": key, "count": count, "tied": len(entries) > 1 and entries[1][1] == count}


def compute_insights(opps: list[dict], emails: list[dict], now, range_days: int = 7) -> dict:
    items = active(opps)
    total = len(items)

    by_type = Counter(o["type"] for o in items)
    by_org = Counter(o["organization"] for o in items)
    by_weekday = Counter(WEEKDAYS[local_date(o["discoveredAt"], now).weekday()] for o in items)

    cat = _top(by_type, lambda k: k)
    org = _top(by_org, lambda k: k)
    day = _top(by_weekday, WEEKDAYS.index)  # Monday-first tie order

    # Daily counts of opportunity emails found, oldest → today.
    today = now.date()
    trend = []
    for i in range(range_days):
        d = add_days(today, i - (range_days - 1))
        trend.append(
            {
                "date": d.isoformat(),
                "label": _SHORT_DAYS[d.weekday()] if range_days == 7 else short_date(d),
                "fullLabel": long_day(d),
                "count": 0,
            }
        )
    index = {p["date"]: i for i, p in enumerate(trend)}
    for e in emails:
        if not is_opportunity_category(e["category"]):
            continue
        i = index.get(local_date(e["receivedAt"], now).isoformat())
        if i is not None:
            trend[i]["count"] += 1

    applied = sum(1 for o in items if o["application"] and o["application"]["status"] == "applied")
    in_progress = sum(1 for o in items if o["application"] and o["application"]["status"] == "in_progress")
    saved = sum(1 for o in items if not o["application"] and o["saved"])
    worth = len(strong_matches(items, now))

    return {
        "total": total,
        "mostCommonCategory": (
            {"type": cat["key"], "count": cat["count"], "percent": js_round(cat["count"] / total * 100), "tied": cat["tied"]}
            if cat
            else None
        ),
        "topCompany": {"name": org["key"], "count": org["count"], "tied": org["tied"]} if org else None,
        "bestDay": {"weekday": day["key"], "count": day["count"], "tied": day["tied"]} if day else None,
        "trend": trend,
        "trendTotal": sum(p["count"] for p in trend),
        "progress": {
            "applied": applied,
            "inProgress": in_progress,
            "saved": saved,
            "other": total - applied - in_progress - saved,
            "total": total,
            "appliedPercent": js_round(applied / total * 100) if total else 0,
        },
        "worthReviewing": worth,
        "recommendation": (
            f"Based on your profile, you have {worth} {'opportunity' if worth == 1 else 'opportunities'} worth reviewing this week."
            if worth
            else "Nothing new to review this week — Oppora will keep watching your inbox."
        ),
    }
