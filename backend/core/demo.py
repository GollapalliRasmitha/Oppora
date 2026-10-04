"""
The public read-only demo ("Try the demo" on the landing page).

- The demo account is the seeded user DEMO_USER_EMAIL. Anyone can open it;
  `DemoReadOnlyMiddleware` refuses every change, so visitors can't edit or
  delete the sample data.
- Production has no Node.js, so it can't run frontend/lib/mock/seed.ts. The
  seed is exported once (`manage.py export_demo_template`) to demo_seed.json
  for a reference day, and `shifted()` moves every date by whole days to
  today. All seed dates are offsets from "today", so the result is identical
  to a fresh export (tests/test_demo.py checks this).
- `ensure_demo()` reloads it when the day changes (the scheduler calls it),
  so days-left and "this week" always match today.
"""

import json
import re
from datetime import date, datetime, timedelta
from functools import cache
from pathlib import Path

from django.conf import settings
from django.db import transaction

from core import clock
from core.locks import locks

TEMPLATE_PATH = Path(__file__).resolve().parent / "demo_seed.json"

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
MONTHS = [
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
#: Dates written into email text ("closes on 4 October"): no year, so the nearest one to the seed's day is meant.
_TEXT_DATE = re.compile(r"\b(\d{1,2}) (" + "|".join(MONTHS) + r")\b")


@cache
def template() -> dict:
    return json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))


def _text_date(m: re.Match, ref: date, days: int) -> str:
    day, month = int(m.group(1)), MONTHS.index(m.group(2)) + 1
    candidates = []
    for year in (ref.year - 1, ref.year, ref.year + 1):
        try:
            candidates.append(date(year, month, day))
        except ValueError:  # 29 February in a non-leap year
            pass
    d = min(candidates, key=lambda c: abs((c - ref).days)) + timedelta(days=days)
    return f"{d.day} {MONTHS[d.month - 1]}"


def _shift(value, days: int, ref: date):
    if isinstance(value, dict):
        return {k: _shift(v, days, ref) for k, v in value.items()}
    if isinstance(value, list):
        return [_shift(v, days, ref) for v in value]
    if isinstance(value, str):
        if _DATE.match(value):
            return (date.fromisoformat(value) + timedelta(days=days)).isoformat()
        if _UTC.match(value):
            t = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ") + timedelta(days=days)
            return t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond // 1000:03d}Z"
        if _TEXT_DATE.search(value):
            return _TEXT_DATE.sub(lambda m: _text_date(m, ref, days), value)
    return value


def shifted(exported: dict, today: date) -> dict:
    """The exported seed with every date moved so that its "today" is `today`."""
    ref = date.fromisoformat(exported["today"])
    return _shift(exported, (today - ref).days, ref)


def demo_today() -> date:
    """Today in the demo account's time zone."""
    tz = clock.zone(template().get("timeZone")) or clock.zone(settings.DEFAULT_USER_TIMEZONE)
    return clock.now().astimezone(tz).date()


def is_demo_user(user) -> bool:
    return bool(getattr(user, "is_authenticated", False) and (user.email or "").lower() == settings.DEMO_USER_EMAIL)


def ensure_demo(force: bool = False):
    """
    Loads the demo for today unless it's already loaded for today. Returns the
    demo user. Safe to call often (one cheap query when nothing changed).
    """
    from accounts.models import GmailConnection, User
    from core.seed import load_seed

    today = demo_today()
    user = User.objects.filter(email=settings.DEMO_USER_EMAIL).first()
    if user and not force:
        g = GmailConnection.objects.filter(user=user).first()
        if g and g.is_demo and g.demo_seeded_for == today:
            return user
    key = "demo-refresh"
    if not locks().acquire(key):
        return user  # another request is reloading it right now
    try:
        with transaction.atomic():
            user, _ = load_seed(shifted(template(), today), settings.DEMO_USER_EMAIL)
            GmailConnection.objects.filter(user=user).update(demo_seeded_for=today)
    finally:
        locks().release(key)
    return user
