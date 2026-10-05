"""
Free-hosting deployment (Render + GitHub Actions scheduler): time-boxed sync
batches, the AI fair share, the scheduler endpoint, the read-only public demo
and its Node-free seed template.
"""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from rest_framework.test import APIClient

from accounts.models import GmailConnection, User
from ai import client as ai_client
from ai.models import AIUserUsage
from config.settings import _cache_url
from core import demo
from core.seed import export_seed
from mail import sync
from mail.models import ProcessedMessage
from notifications.models import Notification
from opportunities.models import Opportunity

from .conftest import KOLKATA, make_client
from .gmail_fakes import message
from .test_pipeline import extraction

NOW = datetime(2026, 10, 2, 9, 30, tzinfo=KOLKATA)


def internship(i: int) -> dict:
    return message(
        f"m{i}",
        subject=f"Frontend Internship {i} — applications open",
        text=f"Acme {i} is hiring frontend interns. We use React. Apply by 20 October 2026.",
        sent=datetime(2026, 9, 20, 10, i, tzinfo=UTC),
    )


def ai_result(i: int) -> dict:
    return extraction(
        opportunity_name=f"Frontend Internship {i}", organization=f"Acme {i}", application_link=None, skills=["React"]
    )


def connected_user(email: str) -> User:
    user = User.objects.create_user(email, name=email.split("@")[0])
    user.preferences.ai_mode = "ai"
    user.preferences.save()
    g = user.gmail
    g.status, g.email = GmailConnection.Status.CONNECTED, email
    g.set_tokens(refresh_token="1//r", access_token="ya29.a", expiry=datetime(2030, 1, 1, tzinfo=UTC))
    g.save()
    return user


class FakeClock:
    """time.monotonic for mail.sync: each email "takes" `step` seconds."""

    def __init__(self, step: float):
        self.t, self.step = 1000.0, step

    def monotonic(self):
        return self.t

    def advance(self):
        self.t += self.step


# --- Time-boxed batches ------------------------------------------------------------


def test_a_batch_stops_on_time_and_the_next_one_continues_where_it_stopped(real_user, gmail, fake_ai, monkeypatch):
    gmail.messages = {m["id"]: m for m in (internship(i) for i in range(5))}
    fake_ai.push(*[ai_result(i) for i in range(5)])
    clock = FakeClock(step=30)
    monkeypatch.setattr(sync, "time", SimpleNamespace(monotonic=clock.monotonic))
    real = sync.process_message

    def slow(user, client, mid):  # each email takes 30 s of the time box
        clock.advance()
        return real(user, client, mid)

    monkeypatch.setattr(sync, "process_message", slow)

    assert sync.run_sync(real_user.pk, seconds=70)  # room for 3 emails (0, 30, 60 s)
    queued = ProcessedMessage.objects.filter(user=real_user, status=ProcessedMessage.Status.QUEUED)
    assert queued.count() == 2 and Opportunity.objects.filter(user=real_user).count() == 3
    g = GmailConnection.objects.get(user=real_user)
    assert (g.sync_phase, g.sync_queued) == ("completed", 2)  # a cut-off run still ends cleanly

    assert sync.run_sync(real_user.pk, seconds=70)  # the next batch picks up the rest
    assert not queued.exists() and Opportunity.objects.filter(user=real_user).count() == 5
    assert len(fake_ai.calls) == 5  # nothing was analysed twice


def test_scan_clicks_use_the_configured_batch_size(real_user, gmail, fake_ai, settings, monkeypatch):
    settings.SYNC_BATCH_SECONDS = 1
    gmail.messages = {m["id"]: m for m in (internship(i) for i in range(3))}
    fake_ai.push(*[ai_result(i) for i in range(3)])
    clock = FakeClock(step=2)
    monkeypatch.setattr(sync, "time", SimpleNamespace(monotonic=clock.monotonic))
    monkeypatch.setattr(sync, "process_message", lambda u, c, m, real=sync.process_message: (clock.advance(), real(u, c, m))[1])
    assert make_client(real_user).post("/api/sync/").status_code == 202
    assert ProcessedMessage.objects.filter(user=real_user, status="queued").count() == 2  # one email per 1 s batch


# --- AI fair share -----------------------------------------------------------------


def test_the_daily_ai_budget_is_split_fairly_between_accounts(real_user, gmail, fake_ai, settings):
    settings.AI_REQUESTS_PER_DAY = 6
    connected_user("b@gmail.example")
    connected_user("c@gmail.example")  # 3 connected accounts → 2 requests each
    assert ai_client.fair_share() == 2
    gmail.messages = {m["id"]: m for m in (internship(i) for i in range(5))}
    fake_ai.push(*[ai_result(i) for i in range(5)])

    sync.run_sync(real_user.pk)
    assert len(fake_ai.calls) == 2  # this account's share, though the global budget has room
    assert ProcessedMessage.objects.filter(user=real_user, status="queued").count() == 3
    assert AIUserUsage.objects.get(user=real_user).requests == 2
    assert not ai_client.user_budget_left(real_user.pk, "fake")


def test_without_fair_share_one_account_may_use_the_whole_budget(real_user, gmail, fake_ai, settings):
    settings.AI_REQUESTS_PER_DAY, settings.AI_FAIR_SHARE = 6, False
    connected_user("b@gmail.example")
    gmail.messages = {m["id"]: m for m in (internship(i) for i in range(4))}
    fake_ai.push(*[ai_result(i) for i in range(4)])
    sync.run_sync(real_user.pk)
    assert len(fake_ai.calls) == 4


# --- Scheduler endpoint ------------------------------------------------------------


@pytest.fixture
def cron(settings):
    settings.CRON_SECRET = "s" * 40
    return APIClient()


def test_scheduler_endpoint_needs_the_secret(db, cron, settings):
    assert cron.post("/api/cron/").status_code == 401
    assert cron.post("/api/cron/", HTTP_AUTHORIZATION="Bearer wrong").status_code == 401
    assert cron.post("/api/cron/", HTTP_AUTHORIZATION=f"Bearer {'s' * 39}x").status_code == 401
    settings.CRON_SECRET = ""
    assert cron.post("/api/cron/", HTTP_AUTHORIZATION="Bearer ").status_code == 404  # off without a secret


def test_a_scheduler_run_continues_scans_sends_reminders_and_refreshes_the_demo(real_user, gmail, fake_ai, cron, freeze):
    gmail.messages = {m["id"]: m for m in (internship(i) for i in range(2))}
    fake_ai.push(*[ai_result(i) for i in range(2)])
    r = cron.post("/api/cron/", HTTP_AUTHORIZATION=f"Bearer {'s' * 40}")
    assert r.status_code == 202  # jobs are eager in tests, so the run already happened
    assert Opportunity.objects.filter(user=real_user).count() == 2
    assert GmailConnection.objects.get(user=real_user).sync_phase == "completed"
    demo_user = User.objects.get(email="alex@example.com")
    assert Opportunity.objects.filter(user=demo_user).count() == 12

    # The day before the deadline, a late run (10:40, not 09:00) still sends the reminder, once.
    o = Opportunity.objects.filter(user=real_user).first()
    o.reminder_set = True
    o.save()
    freeze(datetime(2026, 10, 19, 10, 40, tzinfo=KOLKATA))
    cron.post("/api/cron/", HTTP_AUTHORIZATION=f"Bearer {'s' * 40}")
    cron.post("/api/cron/", HTTP_AUTHORIZATION=f"Bearer {'s' * 40}")
    assert Notification.objects.filter(user=real_user, key__startswith="reminder:").count() == 1


def test_health_endpoint_is_public_and_tiny(db, django_assert_num_queries, monkeypatch):
    """It must answer the moment the process is up: no database, no session, no Redis/cache (rate limiter)."""
    from django.core.cache.backends.locmem import LocMemCache

    def no_cache(*a, **k):
        raise AssertionError("the health check must not touch the cache (Redis in production)")

    for name in ("get", "set", "add", "incr", "get_many", "set_many"):
        monkeypatch.setattr(LocMemCache, name, no_cache)
    with django_assert_num_queries(0):
        for _ in range(100):  # never rate-limited: it's polled while the server wakes up
            r = APIClient().get("/api/health/")
            assert r.status_code == 200 and r.json() == {"ok": True}
    assert "Set-Cookie" not in r.headers  # no session or CSRF cookie either


# --- Public read-only demo ---------------------------------------------------------


@pytest.fixture
def read_only(settings, freeze):
    freeze(NOW)
    settings.DEMO_READ_ONLY = True
    settings.PUBLIC_DEMO_ENABLED = True


def test_try_the_demo_signs_in_to_the_sample_account(db, read_only):
    c = APIClient()
    r = c.get("/api/auth/demo/")
    assert r.status_code == 302 and r["Location"].endswith("/dashboard")
    me = c.get("/api/auth/me/").json()
    assert me["email"] == "alex@example.com" and me["isDemo"] is True and me["readOnly"] is True
    assert c.get("/api/insights/dashboard/").json()["stats"]["total"]["value"] == 12


def test_visitors_cannot_change_or_delete_the_demo(db, read_only):
    c = APIClient(enforce_csrf_checks=False)
    c.get("/api/auth/demo/")
    opp = c.get("/api/opportunities/").json()["results"][0]
    attempts = [
        ("patch", f"/api/opportunities/{opp['id']}/", {"reminderSet": True}),
        ("post", "/api/saved/", {"opportunityId": opp["id"]}),
        ("post", "/api/applications/", {"opportunityId": opp["id"], "status": "applied"}),
        ("patch", "/api/preferences/", {"theme": "light"}),
        ("patch", "/api/auth/me/", {"name": "Hacked"}),
        ("delete", "/api/auth/me/data/", None),
        ("post", "/api/sync/", None),
        ("post", "/api/auth/gmail/disconnect/", None),
        ("post", "/api/notifications/clear/", {"ids": []}),
    ]
    for method, url, body in attempts:
        r = getattr(c, method)(url, body, format="json")
        assert r.status_code == 403, url
        assert r.json()["error"]["code"] == "demo_read_only"
    assert c.get("/api/auth/me/").json()["name"] == "Alex"
    assert Opportunity.objects.filter(user__email="alex@example.com").count() == 12
    # Reading still works, and so does asking the assistant (it changes nothing).
    assert c.post("/api/assistant/", {"question": "What deadlines are approaching?"}, format="json").status_code == 200
    r = c.get("/api/auth/google/login/", {"intent": "connect"})
    assert "gmail_error=demo_read_only" in r["Location"]  # no mailbox can be attached to the demo
    assert c.post("/api/auth/logout/").status_code in (200, 204)


def test_real_accounts_are_not_read_only(real_user, read_only):
    api = make_client(real_user)
    assert api.get("/api/auth/me/").json()["readOnly"] is False
    assert api.patch("/api/preferences/", {"theme": "light"}, format="json").status_code == 200


def test_demo_reloads_once_a_day(db, read_only, freeze):
    u1 = demo.ensure_demo()
    first = set(Opportunity.objects.filter(user=u1).values_list("id", flat=True))
    demo.ensure_demo()
    assert set(Opportunity.objects.filter(user=u1).values_list("id", flat=True)) == first  # same day: untouched
    freeze(NOW + timedelta(days=1))
    demo.ensure_demo()
    assert set(Opportunity.objects.filter(user=u1).values_list("id", flat=True)).isdisjoint(first)
    assert GmailConnection.objects.get(user=u1).demo_seeded_for == (NOW + timedelta(days=1)).date()


@pytest.mark.parametrize("day", ["2026-10-02", "2026-10-31", "2026-12-31", "2027-03-01", "2028-02-29"])
def test_the_seed_template_matches_a_fresh_export_on_any_day(day):
    from datetime import date

    d = date.fromisoformat(day)
    assert demo.shifted(demo.template(), d) == export_seed(d, "Asia/Kolkata")


def test_the_committed_template_is_current():
    """Re-run `manage.py export_demo_template` after editing seed.ts."""
    t = demo.template()
    from datetime import date

    assert t == export_seed(date.fromisoformat(t["today"]), t["timeZone"])


def test_demo_can_be_turned_off(db, settings):
    settings.PUBLIC_DEMO_ENABLED = False
    assert "auth_error=demo_unavailable" in APIClient().get("/api/auth/demo/")["Location"]


# --- Production settings helpers ---------------------------------------------------


def test_cache_url_handles_hosted_redis():
    assert _cache_url("redis://localhost:6379/0") == "redis://localhost:6379/1"
    assert _cache_url("rediss://default:pw@eu1-x.upstash.io:6379") == "rediss://default:pw@eu1-x.upstash.io:6379"
