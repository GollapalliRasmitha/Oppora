"""
Single source of "now" (tests patch `core.clock.now`).

Days left, "this week" and trends depend on the user's calendar day, so
`user_now()` returns an aware datetime in the user's time zone: the browser's
zone from the `X-Timezone` header when valid, else the profile's zone.
"""

from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.utils import timezone


def now() -> datetime:
    return timezone.now()


def zone(name: str | None) -> ZoneInfo | None:
    if not name or len(name) > 64:
        return None
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return None


def user_zone(request) -> ZoneInfo:
    header = zone(request.headers.get("X-Timezone"))
    if header:
        return header
    profile = zone(getattr(request.user, "timezone", None))
    return profile or ZoneInfo(settings.DEFAULT_USER_TIMEZONE)


def user_now(request) -> datetime:
    return now().astimezone(user_zone(request))
