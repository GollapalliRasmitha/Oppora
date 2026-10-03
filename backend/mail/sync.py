"""
Gmail sync: list new message ids → queue them (ProcessedMessage) → run the
pipeline on the queue, at the AI's pace.

- First sync: the last GMAIL_INITIAL_SYNC_DAYS days. Later syncs: Gmail
  history since the stored historyId (a full scan again if it expired).
- The AI's daily limit or an outage leaves emails queued; the sync still
  completes and reports how many are waiting. Nothing is processed twice.
- Auth failures (revoked or expired refresh token) mark the connection
  "Needs reconnect".

The seeded demo account has no mailbox; its scans are simulated.
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction

from accounts.models import GmailConnection
from ai.providers.base import DailyLimitReached, NotConfigured, TransientAIError
from core import clock, jobs
from core.api import GmailAccessError
from core.locks import locks

from .fees import recheck_fees
from .gmail import GmailAuthError, GmailClient, HistoryExpired
from .models import ProcessedMessage
from .pipeline import process_message

log = logging.getLogger(__name__)

RUNNING = (GmailConnection.Phase.SCANNING, GmailConnection.Phase.ANALYZING)
#: A sync that hasn't finished after this long (e.g. the server restarted) can be started again.
STALE_AFTER = timedelta(minutes=30)
#: Consecutive transient AI failures before the run stops (the rest stays queued).
MAX_TRANSIENT_IN_A_ROW = 3

# Demo account: phases derived from elapsed time, as in Stage 7.
DEMO_SCANNING_FOR = timedelta(seconds=1.4)
DEMO_COMPLETES_AFTER = timedelta(seconds=3.6)


#: A sync that was just queued gets this long for a worker to pick it up before it counts as interrupted.
PICKUP_GRACE = timedelta(seconds=60)


def _lock_key(user_id) -> str:
    return f"sync:{user_id}"


def _running(g: GmailConnection, now) -> bool:
    """A real sync runs while its lock is held (core.locks; it expires by itself if a worker dies)."""
    if g.sync_phase not in RUNNING or not g.sync_started_at:
        return False
    if g.is_demo:
        return now - g.sync_started_at < STALE_AFTER
    return locks().held(_lock_key(g.user_id)) or now - g.sync_started_at < PICKUP_GRACE


def advance_demo(g: GmailConnection, now) -> None:
    if not g.is_demo or g.sync_phase not in RUNNING or not g.sync_started_at:
        return
    elapsed = now - g.sync_started_at
    if elapsed >= DEMO_COMPLETES_AFTER:
        g.sync_phase, g.last_synced_at = GmailConnection.Phase.COMPLETED, g.sync_started_at + DEMO_COMPLETES_AFTER
    elif elapsed >= DEMO_SCANNING_FOR:
        g.sync_phase = GmailConnection.Phase.ANALYZING
    else:
        return
    g.save(update_fields=["sync_phase", "last_synced_at"])


def resume_if_interrupted(g: GmailConnection) -> bool:
    """
    A sync marked running with no worker in this process was interrupted (the
    server restarted mid-scan). Picks the queue up again; the queue is
    idempotent, so nothing is processed twice. Called from GET /api/sync/,
    which the UI polls while a sync shows as running.
    """
    if g.is_demo or g.sync_phase not in RUNNING or g.status != GmailConnection.Status.CONNECTED:
        return False
    if _running(g, clock.now()):
        return False
    with transaction.atomic():
        fresh = GmailConnection.objects.select_for_update().get(pk=g.pk)
        if fresh.sync_phase not in RUNNING:
            return False
        fresh.sync_started_at = clock.now()
        fresh.save(update_fields=["sync_started_at"])
    log.info("Resuming an interrupted sync for user %s", g.user_id)
    jobs.enqueue(run_sync, g.user_id)
    g.refresh_from_db()
    return True


def resume_all_interrupted() -> int:
    """At server start: picks up every sync a restart interrupted. Returns how many resumed."""
    resumed = 0
    for g in GmailConnection.objects.filter(sync_phase__in=RUNNING, is_demo=False, status=GmailConnection.Status.CONNECTED):
        resumed += resume_if_interrupted(g)
    return resumed


def start_sync(user, demo_batch: int = 0) -> GmailConnection:
    """POST /api/sync/: starts a scan unless one is already running. Raises GmailAccessError when not connected."""
    now = clock.now()
    with transaction.atomic():
        g = GmailConnection.objects.select_for_update().get(user=user)
        if g.status != GmailConnection.Status.CONNECTED:
            raise GmailAccessError()
        advance_demo(g, now)
        if _running(g, now):
            return g
        g.sync_phase = GmailConnection.Phase.SCANNING
        g.sync_started_at = now
        g.sync_emails_in_batch = demo_batch if g.is_demo else 0
        g.save(update_fields=["sync_phase", "sync_started_at", "sync_emails_in_batch"])
    if not g.is_demo:
        jobs.enqueue(run_sync, user.pk)  # the scanning state is committed above
    return g


def _save(g: GmailConnection, **fields) -> None:
    for k, v in fields.items():
        setattr(g, k, v)
    GmailConnection.objects.filter(pk=g.pk).update(**fields)


def _queue_new_ids(user, client: GmailClient, g: GmailConnection) -> str:
    """Queues message ids Oppora hasn't seen; returns the historyId to store once the scan is done."""
    head = client.history_id()
    limit = settings.GMAIL_MAX_MESSAGES_PER_SYNC
    try:
        ids = client.added_since(g.history_id, limit) if g.history_id else None
    except HistoryExpired:
        ids = None
    if ids is None:
        ids = client.recent_message_ids(g.initial_sync_days, limit)
    ProcessedMessage.objects.bulk_create(
        [ProcessedMessage(user=user, gmail_message_id=i) for i in ids],
        ignore_conflicts=True,  # idempotent: already-seen ids are skipped by the unique constraint
    )
    return head


def process_queue(user, client: GmailClient, g: GmailConnection) -> int:
    """Runs the pipeline over queued messages, oldest first. Returns how many are still queued."""
    queued = ProcessedMessage.objects.filter(user=user, status=ProcessedMessage.Status.QUEUED).order_by("created_at", "id")
    remaining = queued.count()
    _save(g, sync_phase=GmailConnection.Phase.ANALYZING, sync_emails_in_batch=remaining)
    transient = 0
    for pm in list(queued):
        try:
            out = process_message(user, client, pm.gmail_message_id)
        except (DailyLimitReached, NotConfigured) as e:
            log.info("AI unavailable for now (%s); %s emails stay queued", type(e).__name__, remaining)
            pm.last_error = str(e)[:300]
            pm.save(update_fields=["last_error", "updated_at"])
            break
        except TransientAIError as e:
            pm.attempts += 1
            pm.last_error = str(e)[:300]
            pm.save(update_fields=["attempts", "last_error", "updated_at"])
            transient += 1
            if transient >= MAX_TRANSIENT_IN_A_ROW:
                break
            continue
        except GmailAuthError:
            raise
        except Exception as e:  # a bad message must not stop the sync
            log.exception("Pipeline failed for message %s", pm.gmail_message_id)
            pm.status, pm.outcome, pm.last_error = ProcessedMessage.Status.NEEDS_REVIEW, "error", str(e)[:300]
            pm.attempts += 1
            pm.save()
            remaining -= 1
            continue
        transient = 0
        pm.status, pm.outcome, pm.email, pm.last_error = out.status, out.outcome, out.email, out.error[:300]
        pm.attempts += 1
        pm.save()
        remaining -= 1
        _save(g, sync_emails_in_batch=remaining)
        locks().refresh(_lock_key(user.pk))
    return ProcessedMessage.objects.filter(user=user, status=ProcessedMessage.Status.QUEUED).count()


def run_sync(user_id) -> None:
    """The background job behind POST /api/sync/ (one at a time per user, across all processes)."""
    key = _lock_key(user_id)
    if not locks().acquire(key):
        return  # already running (another worker, or a duplicate message)
    try:
        _run_sync(user_id)
    finally:
        locks().release(key)


def _run_sync(user_id) -> None:
    g = GmailConnection.objects.select_related("user").get(user_id=user_id)
    user = g.user
    try:
        client = GmailClient.for_connection(g)
        head = _queue_new_ids(user, client, g)
        _save(g, history_id=head)
        left = process_queue(user, client, g)
        if not left:
            try:  # stored opportunities not yet checked for a fee (cheap: rules first)
                recheck_fees(user, client)
            except (DailyLimitReached, NotConfigured, TransientAIError):
                pass  # checked on a later sync
        _save(
            g,
            sync_phase=GmailConnection.Phase.COMPLETED,
            sync_emails_in_batch=0,
            sync_queued=left,
            last_synced_at=clock.now(),
        )
    except GmailAuthError as e:
        log.info("Gmail needs reconnect for user %s: %s", user_id, e)
        fresh = GmailConnection.objects.get(pk=g.pk)
        status = fresh.status
        if status == GmailConnection.Status.CONNECTED:  # don't undo a disconnect that happened meanwhile
            status = GmailConnection.Status.NEEDS_RECONNECT
        _save(g, status=status, sync_phase=GmailConnection.Phase.ERROR, sync_emails_in_batch=0)
    except Exception:
        log.exception("Sync failed for user %s", user_id)
        _save(g, sync_phase=GmailConnection.Phase.ERROR, sync_emails_in_batch=0)
