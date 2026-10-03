"""
Scheduled notifications (Celery Beat, hourly). Each runs at a fixed local hour
in every user's own time zone and is idempotent: the notification key includes
the date, so a re-run or a retried task never creates a second one.
"""

from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import IntegrityError, transaction

from accounts.models import User
from core import clock
from core.data import opportunity_dicts
from core.domain.dates import days_left, parse_dt
from core.domain.stats import strong_matches, upcoming_deadlines
from opportunities.models import Opportunity

from .models import Notification


def _local_now(user):
    return clock.now().astimezone(clock.zone(user.timezone) or clock.zone(settings.DEFAULT_USER_TIMEZONE))


def _create(user, key: str, **fields) -> bool:
    """Creates the notification unless that key exists already. Returns whether it was new."""
    try:
        with transaction.atomic():
            _, created = Notification.objects.get_or_create(user=user, key=key, defaults=fields)
    except IntegrityError:
        return False
    return created


@shared_task(name="notifications.tasks.deadline_reminders")
def deadline_reminders(force_hour: bool = False) -> int:
    """
    At REMINDER_LOCAL_HOUR: "TCS CodeVita 2026 closes tomorrow." for every
    opportunity with a reminder set whose deadline is tomorrow (or today).
    """
    made = 0
    for user in User.objects.filter(preferences__notify_deadline_reminders=True):
        now = _local_now(user)
        if now.hour != settings.REMINDER_LOCAL_HOUR and not force_hour:
            continue
        today = now.date()
        opps = Opportunity.objects.filter(
            user=user, reminder_set=True, dismissed=False, deadline__due_date__in=[today, today + timedelta(days=1)]
        ).select_related("deadline")
        for o in opps:
            when = "today" if o.deadline.due_date == today else "tomorrow"
            made += _create(
                user,
                f"reminder:{o.id}:{today.isoformat()}",
                kind=Notification.Kind.DEADLINE,
                title="Deadline reminder",
                body=f"{o.title} closes {when}.",
                created_at=clock.now(),
                opportunity=o,
            )
    return made


@shared_task(name="notifications.tasks.daily_briefing")
def daily_briefing(force_hour: bool = False) -> int:
    """At BRIEFING_LOCAL_HOUR: one summary built from the user's own data (only when there's something to say)."""
    made = 0
    for user in User.objects.filter(preferences__ai_recommendations=True):
        now = _local_now(user)
        if now.hour != settings.BRIEFING_LOCAL_HOUR and not force_hour:
            continue
        opps = opportunity_dicts(user)
        if not opps:
            continue
        fresh = sum(
            1
            for o in opps
            if not o["dismissed"] and o["discoveredAt"] and (clock.now() - parse_dt(o["discoveredAt"])) <= timedelta(days=1)
        )
        soon = upcoming_deadlines(opps, now)
        strong = strong_matches(opps, now)
        parts = []
        if fresh:
            parts.append(f"{fresh} new {'opportunity' if fresh == 1 else 'opportunities'} since yesterday")
        if soon:
            first = soon[0]
            d = days_left(first["deadline"], now)
            parts.append(
                f"{len(soon)} {'deadline' if len(soon) == 1 else 'deadlines'} this week (next: {first['title']}, {'today' if d == 0 else f'in {d} day' + ('' if d == 1 else 's')})"
            )
        if strong:
            parts.append(f"{len(strong)} strong {'match' if len(strong) == 1 else 'matches'} to review")
        if not parts:
            continue
        made += _create(
            user,
            f"briefing:{now.date().isoformat()}",
            kind=Notification.Kind.AI_RECOMMENDATION,
            title="Your daily briefing",
            body="; ".join(parts) + ".",
            created_at=clock.now(),
        )
    return made
