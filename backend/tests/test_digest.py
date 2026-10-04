"""Weekly digest: computed from the user's data, Monday 08:00 local, only when the setting is on."""

from datetime import datetime, timedelta

from notifications import tasks as ntasks
from notifications.models import Notification
from opportunities.models import Opportunity

from .conftest import DEMO_NOW, KOLKATA, make_client


def test_digest_is_computed_from_the_users_data(api, ids):
    Opportunity.objects.filter(pk=ids["opp_zoho_web_dev"]).update(
        fee_text="A registration fee of Rs. 500 applies.", fee_amount=500, fee_currency="INR"
    )
    d = api.get("/api/digest/").json()
    assert d["weekOf"] == "2026-09-28" and d["weekLabel"] == "Week of 28 Sept"  # Monday of DEMO_NOW's week
    assert {o["title"] for o in d["newThisWeek"]} >= {"Frontend Developer"}  # the 2 discovered in the last 7 days
    assert len(d["newThisWeek"]) == 2
    assert [o["title"] for o in d["topMatches"]] == ["Google Summer Internship 2027", "Microsoft Explore", "TCS CodeVita 2026"]
    assert all(o["why"].startswith("This opportunity") for o in d["topMatches"])
    assert [o["title"] for o in d["deadlinesSoon"]] == [
        "TCS CodeVita 2026",
        "Microsoft Explore",
        "Women Techmakers Scholarship",
        "Frontend Developer",
    ]
    assert [o["title"] for o in d["feeWarnings"]] == ["Junior Web Developer"]
    assert d["feeWarnings"][0]["fee"]["amount"] == 500.0
    assert d["progress"] == {"applied": 8, "inProgress": 3, "saved": 1, "total": 12, "appliedPercent": 67}


def test_fee_asking_opportunities_are_never_top_matches(api, ids):
    Opportunity.objects.filter(pk=ids["opp_google_summer_2027"]).update(
        fee_text="Pay ₹999 to apply.", fee_amount=999, fee_currency="INR"
    )
    tops = [o["title"] for o in api.get("/api/digest/").json()["topMatches"]]
    assert "Google Summer Internship 2027" not in tops


def test_weekly_notification_only_on_monday_8am_local_and_only_when_on(user, freeze, settings):
    monday_8 = datetime(2026, 10, 5, 8, 15, tzinfo=KOLKATA)
    freeze(monday_8)
    assert ntasks.weekly_digest() == 0  # setting off (default)
    user.preferences.notify_weekly_digest = True
    user.preferences.save()
    freeze(monday_8 + timedelta(hours=1))
    assert ntasks.weekly_digest() == 0  # 09:00: not the hour
    freeze(monday_8 + timedelta(days=1))
    assert ntasks.weekly_digest() == 0  # Tuesday
    freeze(monday_8)
    assert ntasks.weekly_digest() == 1
    assert ntasks.weekly_digest() == 0  # once per week
    n = Notification.objects.get(user=user, key="digest:2026-10-05")
    assert n.title == "Your weekly digest" and n.link == "/digest"
    assert "top match: Google Summer Internship 2027" in n.body  # names keep their capitals
    items = make_client(user).get("/api/notifications/").json()
    digest = next(i for i in items if i["title"] == "Your weekly digest")
    assert digest["href"] == "/digest"
    # Turning the setting off hides it from the bell.
    user.preferences.notify_weekly_digest = False
    user.preferences.save()
    assert all(i["title"] != "Your weekly digest" for i in make_client(user).get("/api/notifications/").json())


def test_beat_schedules_the_weekly_digest(settings):
    assert settings.CELERY_BEAT_SCHEDULE["weekly-digest"]["task"] == "notifications.tasks.weekly_digest"
    assert DEMO_NOW.tzinfo is KOLKATA
