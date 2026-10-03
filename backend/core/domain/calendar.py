"""Calendar items: deadlines, interviews and reminders (port of buildCalendarItems)."""

from datetime import datetime, time

from .constants import REMINDER_HOUR, deadline_kind
from .dates import add_days, iso, local_date, parse_date


def build_calendar_items(opps: list[dict], interviews: list[dict], now) -> list[dict]:
    items_active = [o for o in opps if not o["dismissed"]]
    by_id = {o["id"]: o for o in items_active}
    today = now.date()
    items = []

    for o in items_active:
        if o["deadline"]:
            items.append(
                {
                    "id": f"deadline_{o['id']}",
                    "kind": deadline_kind(o["type"]),
                    "title": o["title"],
                    "date": o["deadline"],
                    "start": None,
                    "end": None,
                    "location": None,
                    "opportunityId": o["id"],
                    "organization": o["organization"],
                }
            )

    for iv in interviews:
        opp = by_id.get(iv["opportunityId"])
        if not opp:
            continue
        items.append(
            {
                "id": iv["id"],
                "kind": "interview",
                "title": iv["title"],
                "date": local_date(iv["start"], now).isoformat(),
                "start": iv["start"],
                "end": iv["end"],
                "location": iv["location"],
                "opportunityId": opp["id"],
                "organization": opp["organization"],
            }
        )

    for o in items_active:
        if not o["reminderSet"] or not o["deadline"]:
            continue
        due = parse_date(o["deadline"])
        if due < today:
            continue  # no reminders for closed deadlines
        day_before = add_days(due, -1)
        when = due if day_before < today else day_before
        start = datetime.combine(when, time(REMINDER_HOUR), tzinfo=now.tzinfo)
        items.append(
            {
                "id": f"reminder_{o['id']}",
                "kind": "reminder",
                "title": o["title"],
                "date": when.isoformat(),
                "start": iso(start),
                "end": None,
                "location": None,
                "opportunityId": o["id"],
                "organization": o["organization"],
            }
        )
    return items
