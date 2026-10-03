"""
Date helpers (port of frontend/lib/domain/dates.ts). `now` is always an
aware datetime in the user's zone (core.clock.user_now), so `now.date()` is
the user's "today".
"""

from datetime import UTC, date, datetime, timedelta

MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]
MONTHS_LONG = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def parse_dt(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def parse_date(value: str | date) -> date:
    return value if isinstance(value, date) else date.fromisoformat(value)


def iso(value: datetime) -> str:
    """UTC ISO timestamp with a Z, like JavaScript's toISOString()."""
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def local_date(value: str | datetime, now: datetime) -> date:
    """Calendar date of a timestamp in the user's zone."""
    return parse_dt(value).astimezone(now.tzinfo).date()


def days_left(deadline: str | date | None, now: datetime) -> int | None:
    if not deadline:
        return None
    return (parse_date(deadline) - now.date()).days


def urgency_for(days: int | None) -> str:
    if days is None:
        return "none"
    if days < 0:
        return "passed"
    if days <= 3:
        return "urgent"
    if days <= 10:
        return "soon"
    return "later"


def days_left_label(days: int | None) -> str:
    if days is None:
        return "No deadline mentioned"
    if days < 0:
        return "Closed"
    if days == 0:
        return "Due today"
    if days == 1:
        return "1 day left"
    return f"{days} days left"


def format_date(value: str | date | None) -> str:
    """Formats a date like the UI (en-GB), e.g. 15 Dec 2026."""
    if not value:
        return "Not mentioned in email"
    d = parse_date(value)
    return f"{d.day} {MONTHS_SHORT[d.month - 1]} {d.year}"


def short_date(d: date) -> str:
    return f"{d.day} {MONTHS_SHORT[d.month - 1]}"


def long_day(d: date) -> str:
    """e.g. Friday 2 October."""
    return f"{WEEKDAYS[d.weekday()]} {d.day} {MONTHS_LONG[d.month - 1]}"


def time_label(value: str | datetime, now: datetime) -> str:
    return parse_dt(value).astimezone(now.tzinfo).strftime("%H:%M")


def is_within_last_week(value: str | None, now: datetime) -> bool:
    if not value:
        return False
    t = parse_dt(value)
    return t <= now and now - t <= timedelta(days=7)


def add_days(d: date, n: int) -> date:
    return d + timedelta(days=n)
