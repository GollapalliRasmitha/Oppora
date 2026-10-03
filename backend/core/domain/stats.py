"""
Dashboard numbers, recommendation copy and bell notifications (port of
frontend/lib/domain/stats.ts). Inputs are opportunities in API shape
(camelCase dicts); every number is computed, nothing is hard-coded.
"""

from .constants import SOON_WINDOW_DAYS, STRONG_MATCH
from .dates import days_left, is_within_last_week, iso, parse_dt, urgency_for


def active(opps: list[dict]) -> list[dict]:
    return [o for o in opps if not o["dismissed"]]


def _status(o: dict) -> str | None:
    return o["application"]["status"] if o["application"] else None


def _due_within(o: dict, now, window=SOON_WINDOW_DAYS) -> bool:
    d = days_left(o["deadline"], now)
    return d is not None and 0 <= d <= window


def compute_dashboard_stats(opps: list[dict], now) -> dict:
    items = active(opps)
    this_week = [o for o in items if _due_within(o, now)]
    urgent = sum(1 for o in this_week if urgency_for(days_left(o["deadline"], now)) == "urgent")
    applied = [o for o in items if _status(o) == "applied"]
    in_progress = [o for o in items if _status(o) == "in_progress"]

    new_this_week = sum(1 for o in items if is_within_last_week(o["discoveredAt"], now))
    applied_this_week = sum(1 for o in applied if is_within_last_week(o["application"]["appliedAt"], now))
    started_this_week = sum(1 for o in in_progress if is_within_last_week(o["application"]["startedAt"], now))

    return {
        "total": {"value": len(items), "trend": new_this_week, "trendLabel": f"+{new_this_week} this week"},
        "deadlinesThisWeek": {"value": len(this_week), "urgent": urgent, "trend": urgent, "trendLabel": f"{urgent} urgent"},
        "applied": {"value": len(applied), "trend": applied_this_week, "trendLabel": f"+{applied_this_week} this week"},
        "inProgress": {"value": len(in_progress), "trend": started_this_week, "trendLabel": f"+{started_this_week} this week"},
        "saved": sum(1 for o in items if o["saved"]),
    }


def latest_opportunities(opps: list[dict], limit: int = 5) -> list[dict]:
    return sorted(active(opps), key=lambda o: parse_dt(o["discoveredAt"]), reverse=True)[:limit]


def upcoming_deadlines(opps: list[dict], now, window: int = SOON_WINDOW_DAYS) -> list[dict]:
    soon = [o for o in active(opps) if _due_within(o, now, window)]
    return sorted(soon, key=lambda o: days_left(o["deadline"], now))


def strong_matches(opps: list[dict], now) -> list[dict]:
    def ok(o):
        d = days_left(o["deadline"], now)
        return o["matchScore"] >= STRONG_MATCH and _status(o) != "applied" and (d is None or d >= 0)

    return [o for o in active(opps) if ok(o)]


_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]


def _word(n: int) -> str:
    return _WORDS[n] if n < len(_WORDS) else str(n)


def build_recommendation(opps: list[dict], now) -> dict:
    matches = strong_matches(opps, now)
    soon = [o for o in matches if (d := days_left(o["deadline"], now)) is not None and d <= SOON_WINDOW_DAYS]
    n = len(matches)
    if n == 0:
        message = "I haven't found any new strong matches for your interests yet. I'll keep watching your inbox."
    else:
        message = f"I found {n} {'opportunity that strongly matches' if n == 1 else 'opportunities that strongly match'} your interests."
        if not soon:
            message += f" None of {'it closes' if n == 1 else 'them close'} in the next {SOON_WINDOW_DAYS} days."
        elif len(soon) == n == 1:
            message += " It has a deadline coming up soon."
        else:
            message += (
                f" {_word(len(soon)).capitalize()} {'has a deadline' if len(soon) == 1 else 'have deadlines'} coming up soon."
            )
    return {"message": message, "matchIds": [o["id"] for o in matches], "soonIds": [o["id"] for o in soon]}


def recent_email_count(emails: list[dict], now) -> int:
    return sum(1 for e in emails if is_within_last_week(e["receivedAt"], now))


def derive_notifications(opps: list[dict], now) -> list[dict]:
    """
    The bell's notifications. `key` is stable per fact (opportunity + kind),
    so read/cleared state is kept when the numbers in the text change.
    """
    items = active(opps)
    out = []
    strong = strong_matches(items, now)
    newest = max(strong, key=lambda o: o["matchScore"], default=None)
    if newest:
        out.append(
            {
                "key": f"new:{newest['id']}",
                "kind": "new_opportunity",
                "title": "New opportunity found",
                "body": f"{newest['title']} matches your profile.",
                "createdAt": newest["discoveredAt"],
                "read": False,
                "opportunityId": newest["id"],
            }
        )
    closest = next((o for o in upcoming_deadlines(items, now) if _status(o) != "applied"), None)
    if closest:
        d = days_left(closest["deadline"], now)
        when = "today" if d == 0 else f"in {d} day{'' if d == 1 else 's'}"
        out.append(
            {
                "key": f"deadline:{closest['id']}",
                "kind": "deadline",
                "title": "Deadline approaching",
                "body": f"{closest['title']} closes {when}.",
                "createdAt": iso(now),
                "read": False,
                "opportunityId": closest["id"],
            }
        )
    if strong:
        n = len(strong)
        out.append(
            {
                "key": "ai_recommendation",
                "kind": "ai_recommendation",
                "title": "AI recommendation",
                "body": f"You have {n} {'opportunity' if n == 1 else 'opportunities'} worth reviewing.",
                "createdAt": iso(now),
                "read": True,
                "opportunityId": None,
            }
        )
    return out
