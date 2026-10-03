"""Stage 9: Celery jobs, Beat schedule, locks, resume after the daily limit, scheduled notifications."""

from datetime import timedelta

import pytest
from kombu.exceptions import OperationalError

from ai.models import AIUsage
from core import jobs
from core.locks import locks
from core.tasks import ALLOWED_JOBS, run_job
from mail import sync, tasks
from mail.models import ProcessedMessage
from notifications import tasks as ntasks
from notifications.models import Notification
from opportunities.models import Deadline, Opportunity

from .conftest import DEMO_NOW, PIPELINE_NOW, make_client
from .test_pipeline import INTERNSHIP, extraction


def test_queued_emails_resume_after_the_daily_limit_resets(real_user, gmail, fake_ai, settings):
    from ai.client import quota_day

    ProcessedMessage.objects.create(user=real_user, gmail_message_id="m1")  # left queued yesterday
    gmail.messages = {"m1": INTERNSHIP}
    settings.AI_REQUESTS_PER_DAY = 5
    AIUsage.objects.create(provider="gemini", day=quota_day(), requests=5)  # today's budget is spent
    assert tasks.resume_queued() == 0  # nothing would get through: don't start
    AIUsage.objects.all().delete()  # the quota day rolled over
    fake_ai.push(extraction())
    assert tasks.resume_queued() == 1
    assert ProcessedMessage.objects.get(gmail_message_id="m1").outcome == "stored"
    assert Opportunity.objects.filter(user=real_user).count() == 1
    assert tasks.resume_queued() == 0  # nothing left


def test_resume_picks_up_an_interrupted_sync(real_user, gmail, fake_ai):
    g = real_user.gmail
    g.sync_phase, g.sync_started_at = "analyzing", PIPELINE_NOW - timedelta(minutes=5)  # worker died; lock expired
    g.save()
    ProcessedMessage.objects.create(user=real_user, gmail_message_id="m1")
    gmail.messages = {"m1": INTERNSHIP}
    fake_ai.push(extraction())
    assert tasks.resume_queued() == 1
    g.refresh_from_db()
    assert g.sync_phase == "completed"


def test_a_running_sync_is_not_started_twice(real_user, gmail, fake_ai):
    key = f"sync:{real_user.pk}"
    assert locks().acquire(key)  # another worker holds the user's sync
    try:
        g = real_user.gmail
        g.sync_phase, g.sync_started_at = "analyzing", PIPELINE_NOW - timedelta(minutes=5)
        g.save()
        assert tasks.resume_queued() == 0
        sync.run_sync(real_user.pk)  # a duplicate message is a no-op
        assert fake_ai.calls == []
    finally:
        locks().release(key)


def test_sync_all_runs_incremental_scans_for_connected_accounts(real_user, gmail, fake_ai, user):
    gmail.messages = {"m1": INTERNSHIP}
    fake_ai.push(extraction())
    assert tasks.sync_all() == 1  # the real account only (the demo has no mailbox)
    assert Opportunity.objects.filter(user=real_user).count() == 1


def test_jobs_go_to_celery_and_fall_back_when_redis_is_down(settings, monkeypatch):
    settings.JOBS_EAGER = False
    settings.JOBS_BACKEND = "celery"
    sent, ran = [], []
    monkeypatch.setattr(run_job, "delay", lambda *a: sent.append(a))
    jobs.enqueue(sync.run_sync, "u1")
    assert sent == [("mail.sync.run_sync", ["u1"], {})]

    def down(*a):
        raise OperationalError("Error 10061 connecting to localhost:6379")

    monkeypatch.setattr(run_job, "delay", down)
    monkeypatch.setattr(jobs, "_in_thread", lambda fn, args, kwargs: ran.append((fn.__name__, args)))
    jobs.enqueue(sync.run_sync, "u2")
    assert ran == [("run_sync", ("u2",))]


def test_run_job_only_runs_allowed_functions():
    assert ALLOWED_JOBS == {"mail.sync.run_sync"}
    with pytest.raises(ValueError):
        run_job("os.system", ["echo pwned"], {})


def test_beat_schedule_points_at_real_tasks(settings):
    from config.celery import app

    app.loader.import_default_modules()
    names = {e["task"] for e in settings.CELERY_BEAT_SCHEDULE.values()}
    assert names <= set(app.tasks)
    assert "core.run_job" in app.tasks


# --- Scheduled notifications ------------------------------------------------------------


def test_deadline_reminders_once_per_day(api, user, ids):
    tcs = Opportunity.objects.get(pk=ids["opp_tcs_codevita_2026"])  # reminder on, due in 2 days at DEMO_NOW
    Deadline.objects.filter(opportunity=tcs).update(due_date=DEMO_NOW.date() + timedelta(days=1))
    assert ntasks.deadline_reminders(force_hour=True) >= 1
    assert ntasks.deadline_reminders(force_hour=True) == 0  # idempotent (key includes the date)
    n = Notification.objects.get(user=user, key=f"reminder:{tcs.id}:{DEMO_NOW.date().isoformat()}")
    assert n.body == "TCS CodeVita 2026 closes tomorrow." and n.kind == "deadline"
    bodies = [x["body"] for x in api.get("/api/notifications/").json()]
    assert "TCS CodeVita 2026 closes tomorrow." in bodies

    user.preferences.notify_deadline_reminders = False
    user.preferences.save()
    assert "TCS CodeVita 2026 closes tomorrow." not in [x["body"] for x in api.get("/api/notifications/").json()]


def test_daily_briefing_from_the_users_own_data(api, user):
    assert ntasks.daily_briefing(force_hour=True) == 1
    assert ntasks.daily_briefing(force_hour=True) == 0
    n = Notification.objects.get(user=user, key=f"briefing:{DEMO_NOW.date().isoformat()}")
    assert n.title == "Your daily briefing"
    assert "4 deadlines this week (next: TCS CodeVita 2026, in 2 days)" in n.body and "3 strong matches to review" in n.body
    assert any(x["title"] == "Your daily briefing" for x in make_client(user).get("/api/notifications/").json())


def test_scheduled_jobs_wait_for_the_users_local_hour(user, settings):
    settings.BRIEFING_LOCAL_HOUR = (DEMO_NOW.hour + 3) % 24  # not now in Kolkata
    assert ntasks.daily_briefing() == 0
