"""
One scheduler run, for hosting without Celery Beat (Render's free tier).

A free external scheduler (GitHub Actions, hourly) calls POST /api/cron/ with
CRON_SECRET; the endpoint answers at once and runs `tick()` in the background.
Everything here is safe to run late, twice, or after a missed hour:

- the demo is reloaded only when the day changed;
- reminders, the briefing and the digest use date-stamped keys (never twice)
  and fire on the first run at or after their local hour;
- email processing is time-boxed and resumable: it continues each account's
  queue where the last run (or Scan click) stopped. The time is shared fairly:
  each account gets an equal slice of what's left, and the AI budget is split
  per account (ai.client fair share).

Locally, Celery Beat runs the same jobs on its own schedule.
"""

import logging
import time

from django.conf import settings

from accounts.models import GmailConnection
from core.locks import locks

log = logging.getLogger(__name__)


def sync_accounts(total_seconds: float) -> dict:
    """New mail + queued emails for every connected account, within `total_seconds` overall."""
    from mail import sync

    accounts = list(
        GmailConnection.objects.filter(is_demo=False, status=GmailConnection.Status.CONNECTED).order_by("sync_started_at")
    )  # longest-waiting first
    deadline = time.monotonic() + total_seconds
    ran, busy = 0, 0
    for i, g in enumerate(accounts):
        left = deadline - time.monotonic()
        if left <= 5:
            break
        slice_ = left / (len(accounts) - i)  # time an earlier account didn't use goes to the next
        if sync.run_scheduled(g.user_id, slice_):
            ran += 1
        else:
            busy += 1  # a Scan click is already working on it
    return {"accounts": len(accounts), "ran": ran, "busy": busy}


def _guardrail_outbox():
    """Security events GuardRail couldn't take earlier (it was down): send them now. Never fails the run."""
    from guardrail.client import flush_outbox, is_enabled

    if not is_enabled():
        return "off"
    try:
        return flush_outbox()
    except Exception:
        log.exception("GuardRail outbox flush failed")
        return "failed"


def tick() -> dict:
    """One scheduler run (see the module docstring). Returns a small report for the logs."""
    from core.demo import ensure_demo
    from notifications.tasks import daily_briefing, deadline_reminders, weekly_digest

    if not locks().acquire("scheduler"):
        return {"skipped": "a scheduler run is already in progress"}
    report: dict = {}
    try:
        if settings.PUBLIC_DEMO_ENABLED:
            try:
                ensure_demo()
                report["demo"] = "ok"
            except Exception:
                log.exception("Demo refresh failed")
                report["demo"] = "failed"
        # Fast, no AI: before the time-boxed email work.
        report["reminders"] = deadline_reminders()
        report["briefings"] = daily_briefing()
        report["digests"] = weekly_digest()
        report["sync"] = sync_accounts(settings.CRON_BATCH_SECONDS)
        report["guardrail"] = _guardrail_outbox()
    finally:
        locks().release("scheduler")
    log.warning("Scheduler run: %s", report)  # WARNING so it shows with production's log level
    return report
