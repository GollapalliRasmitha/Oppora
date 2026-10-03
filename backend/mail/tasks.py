"""Celery Beat jobs for Gmail (schedules in settings.CELERY_BEAT_SCHEDULE)."""

import logging

from celery import shared_task
from django.conf import settings

from accounts.models import GmailConnection
from ai import client as ai_client
from core import clock

from . import sync
from .models import ProcessedMessage

log = logging.getLogger(__name__)


def _connected():
    return GmailConnection.objects.filter(is_demo=False, status=GmailConnection.Status.CONNECTED).select_related("user")


def _ai_budget_left() -> bool:
    provider = settings.AI_PROVIDER if settings.AI_PROVIDER in ("gemini", "openai") else "gemini"
    return ai_client.requests_today(provider) < settings.AI_REQUESTS_PER_DAY


@shared_task(name="mail.tasks.resume_queued")
def resume_queued() -> int:
    """
    Every 10 minutes: picks up interrupted syncs, and continues queued emails as
    soon as the AI's daily budget is available again (the free tier resets at
    midnight Pacific). Returns how many syncs it started.
    """
    started = 0
    now = clock.now()
    budget = _ai_budget_left()
    for g in _connected():
        if g.sync_phase in sync.RUNNING:
            started += sync.resume_if_interrupted(g)
        elif budget and ProcessedMessage.objects.filter(user=g.user, status=ProcessedMessage.Status.QUEUED).exists():
            log.info("Resuming queued emails for user %s", g.user_id)
            sync.start_sync(g.user)
            started += 1
    if started:
        log.info("resume_queued started %s sync(s) at %s", started, now)
    return started


@shared_task(name="mail.tasks.sync_all")
def sync_all() -> int:
    """Twice an hour: new mail for every connected account (Gmail history since the last scan)."""
    started = 0
    for g in _connected():
        if g.sync_phase not in sync.RUNNING:
            sync.start_sync(g.user)
            started += 1
    return started
