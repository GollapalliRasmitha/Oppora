"""
"Sync completed" but nothing found: an AI error that affects every email must
stop the run and keep the emails queued (not fail them one by one), already
"failed" ones must be retried, and the sync status must say what really happened.
"""

from datetime import UTC, datetime

from accounts.models import GmailConnection
from ai.providers.base import AIError, DailyLimitReached
from mail import sync
from mail.models import ProcessedMessage
from opportunities.models import Opportunity

from .conftest import make_client
from .gmail_fakes import message
from .test_pipeline import extraction


def mails(n: int, start: int = 0) -> dict:
    out = {}
    for i in range(start, start + n):
        out[f"m{i}"] = message(
            f"m{i}",
            subject=f"Frontend Internship {i} — applications open",
            text=f"Acme {i} is hiring frontend interns. We use React. Apply by 20 October 2026.",
            sent=datetime(2026, 9, 20, 10, i % 60, tzinfo=UTC),
        )
    out["p1"] = message("p1", subject="40% off all courses", text="Big sale!", labels=["CATEGORY_PROMOTIONS"])
    return out


def ok(i: int) -> dict:
    return extraction(opportunity_name=f"Frontend Internship {i}", organization=f"Acme {i}", application_link=None)


def status(user) -> dict:
    return make_client(user).get("/api/sync/").json()


def test_first_scan_covers_the_last_60_days_and_scan_runs_the_ai_right_away(real_user, gmail, fake_ai, monkeypatch):
    seen = {}
    real = gmail.recent_message_ids
    monkeypatch.setattr(gmail, "recent_message_ids", lambda days, limit: seen.update(days=days) or real(days, limit))
    gmail.messages = mails(2)
    fake_ai.push(ok(0), ok(1))
    assert make_client(real_user).post("/api/sync/").status_code == 202
    assert seen["days"] == 60  # GMAIL_INITIAL_SYNC_DAYS for a new account
    assert len(fake_ai.calls) == 2  # analysed during the Scan itself, not left for the scheduler
    s = status(real_user)
    assert (s["fetched"], s["filtered"], s["analysed"], s["found"], s["queued"], s["waitReason"]) == (3, 1, 2, 2, 0, "")


def test_an_ai_error_on_every_email_keeps_them_queued_and_says_why(real_user, gmail, fake_ai):
    gmail.messages = mails(4)
    fake_ai.push(AIError("Gemini 400: API key not valid. Please pass a valid API key."))
    sync.run_sync(real_user.pk)
    assert len(fake_ai.calls) == 1  # stopped at the first refusal instead of failing all 4
    assert ProcessedMessage.objects.filter(user=real_user, status="needs_review").count() == 0
    # All 5 stay queued (4 internships + the promotion, which the pre-filter skips on the next run).
    assert ProcessedMessage.objects.filter(user=real_user, status="queued").count() == 5
    s = status(real_user)
    assert s["phase"] == "completed" and s["queued"] == 5
    assert s["waitReason"] == "ai_unavailable" and s["waitDetail"].startswith("Gemini 400: API key not valid")

    # Once the AI works again, the next run picks them all up.
    fake_ai.push(*[ok(i) for i in range(4)])
    sync.run_sync(real_user.pk)
    s = status(real_user)
    assert (s["queued"], s["waitReason"], s["found"]) == (0, "", 4)


def test_emails_that_failed_only_because_of_the_ai_are_retried(real_user, gmail, fake_ai):
    """Before this fix, an AI refusal marked each email failed for good (what the testers' accounts show)."""
    gmail.messages = mails(3)
    for i in range(3):
        ProcessedMessage.objects.create(
            user=real_user, gmail_message_id=f"m{i}", status="needs_review", outcome="error",
            last_error="Gemini 400: API key not valid. Please pass a valid API key.",
        )  # fmt: skip
    ProcessedMessage.objects.create(
        user=real_user, gmail_message_id="p1", status="needs_review", outcome="error", last_error="KeyError: 'payload'"
    )  # a genuinely broken message: not retried
    fake_ai.push(ok(0), ok(1), ok(2))
    sync.run_sync(real_user.pk)
    assert Opportunity.objects.filter(user=real_user).count() == 3
    assert ProcessedMessage.objects.get(user=real_user, gmail_message_id="p1").status == "needs_review"


def test_the_daily_limit_and_the_fair_share_are_told_apart(real_user, gmail, fake_ai):
    from ai.client import ShareUsedUp

    gmail.messages = mails(2)
    fake_ai.push(DailyLimitReached("Gemini 429: quota exceeded (per day)"))
    sync.run_sync(real_user.pk)
    s = status(real_user)
    assert s["waitReason"] == "ai_quota" and s["queued"] == 3 and s["resetsAt"]

    fake_ai.push(ShareUsedUp("This account's fair share of today's AI budget is used up (66)."))
    sync.run_sync(real_user.pk)
    s = status(real_user)
    assert s["waitReason"] == "ai_share" and s["resetsAt"]


def test_a_batch_that_runs_out_of_time_says_it_continues(real_user, gmail, fake_ai, monkeypatch):
    from types import SimpleNamespace

    gmail.messages = mails(3)
    fake_ai.push(ok(0), ok(1), ok(2))
    t = {"now": 0.0}

    def tick():
        t["now"] += 40
        return t["now"]

    monkeypatch.setattr(sync, "time", SimpleNamespace(monotonic=tick))
    sync.run_sync(real_user.pk, seconds=100)
    s = status(real_user)
    assert s["waitReason"] == "time_box" and s["queued"] > 0 and s["found"] >= 1


def test_one_broken_message_still_fails_alone(real_user, gmail, fake_ai, monkeypatch):
    gmail.messages = mails(2)
    real = sync.process_message

    def flaky(user, client, mid):
        if mid == "m0":
            raise KeyError("payload")  # not an AI problem: only this message is affected
        return real(user, client, mid)

    monkeypatch.setattr(sync, "process_message", flaky)
    fake_ai.push(ok(1))
    sync.run_sync(real_user.pk)
    s = status(real_user)
    assert (s["failed"], s["found"], s["queued"], s["waitReason"]) == (1, 1, 0, "")


def test_the_demo_shows_its_sample_totals(user):
    s = make_client(user).get("/api/sync/").json()
    assert GmailConnection.objects.get(user=user).is_demo
    assert s["fetched"] == 27 and s["analysed"] == 27 and s["found"] == 12
