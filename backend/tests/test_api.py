"""Endpoint behaviour: lists, filters, actions, validation, preferences, Gmail/sync, deletion."""

from datetime import timedelta

from accounts.models import GmailConnection
from mail.models import Email
from notifications.models import Notification
from opportunities.models import Opportunity, SavedItem

from .conftest import DEMO_NOW


def titles(rows):
    return [r["title"] for r in rows]


# --- Opportunities ------------------------------------------------------------


def test_opportunity_shape_matches_the_frontend_type(api, ids):
    o = api.get(f"/api/opportunities/{ids['opp_amazon_frontend']}/").json()
    assert set(o) == {
        "id",
        "title",
        "organization",
        "type",
        "deadline",
        "priority",
        "matchScore",
        "discoveredAt",
        "summary",
        "location",
        "duration",
        "eligibility",
        "skills",
        "requirements",
        "benefits",
        "applicationLink",
        "matchReasons",
        "sourceEmailIds",
        "saved",
        "application",
        "reminderSet",
        "dismissed",
    }
    assert o["deadline"] == "2026-10-09"
    assert o["eligibility"] is None  # not in the email → null, never guessed


def test_list_filters_search_and_ordering(api):
    assert api.get("/api/opportunities/?type=Hackathon").json()["count"] == 3
    assert api.get("/api/opportunities/?type=Hackathon&type=Job").json()["count"] == 6
    assert api.get("/api/opportunities/?saved=true").json()["count"] == 7
    assert api.get("/api/opportunities/?status=applied").json()["count"] == 8
    assert api.get("/api/opportunities/?status=in_progress").json()["count"] == 3
    assert titles(api.get("/api/opportunities/?q=amazon").json()["results"]) == ["Frontend Developer"]
    dates = [o["deadline"] for o in api.get("/api/opportunities/?ordering=deadline__due_date").json()["results"]]
    assert dates == sorted(dates)
    assert api.get("/api/opportunities/?type=Nope").status_code == 400


def test_pagination(api):
    page = api.get("/api/emails/?page_size=10").json()
    assert page["count"] == 27 and len(page["results"]) == 10 and "page=2" in page["next"]
    assert len(api.get("/api/emails/?page_size=10&page=3").json()["results"]) == 7
    assert api.get("/api/emails/?page=99").status_code == 404


def test_list_queries_are_bounded(api, django_assert_max_num_queries):
    with django_assert_max_num_queries(6):  # session + user + count + page + prefetch
        assert api.get("/api/opportunities/").status_code == 200
    with django_assert_max_num_queries(5):
        assert api.get("/api/emails/?page_size=200").status_code == 200


def test_patch_only_changes_allowed_fields(api, ids):
    url = f"/api/opportunities/{ids['opp_amazon_frontend']}/"
    r = api.patch(url, {"reminderSet": True, "title": "Hacked", "matchScore": 1}, format="json").json()
    assert r["reminderSet"] is True and r["title"] == "Frontend Developer" and r["matchScore"] == 86


def test_dismiss_hides_everywhere_and_restore_brings_it_back(api, ids):
    url = f"/api/opportunities/{ids['opp_amazon_frontend']}/"
    api.patch(url, {"dismissed": True}, format="json")
    assert api.get("/api/opportunities/").json()["count"] == 11
    assert api.get("/api/insights/dashboard/").json()["stats"]["deadlinesThisWeek"]["value"] == 3
    assert api.get("/api/opportunities/?dismissed=true").json()["count"] == 1
    api.patch(url, {"dismissed": False}, format="json")
    assert api.get("/api/opportunities/").json()["count"] == 12


# --- Saved + applications -----------------------------------------------------


def test_saving_is_idempotent(api, ids):
    opp = api.get("/api/opportunities/?saved=false").json()["results"][0]["id"]
    assert api.post("/api/saved/", {"opportunityId": opp}, format="json").status_code == 201
    assert api.post("/api/saved/", {"opportunityId": opp}, format="json").status_code == 200
    assert api.get(f"/api/opportunities/{opp}/").json()["saved"] is True
    assert api.delete(f"/api/saved/?opportunityId={opp}").status_code == 204
    assert api.get(f"/api/opportunities/{opp}/").json()["saved"] is False

    email = ids["em_newsletter"]
    assert api.post("/api/saved/", {"emailId": email}, format="json").status_code == 201
    assert api.get(f"/api/emails/{email}/").json()["saved"] is True


def test_saved_needs_exactly_one_target(api, ids):
    r = api.post("/api/saved/", {}, format="json")
    assert r.status_code == 400 and r.json()["error"]["code"] == "validation_error"
    both = {"opportunityId": ids["opp_amazon_frontend"], "emailId": ids["em_newsletter"]}
    assert api.post("/api/saved/", both, format="json").status_code == 400


def test_mark_applied_upserts(api, ids, freeze):
    opp = ids["opp_amazon_frontend"]
    freeze(DEMO_NOW + timedelta(minutes=5))
    r = api.post("/api/applications/", {"opportunityId": opp, "status": "applied"}, format="json")
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "applied" and body["appliedAt"] and body["opportunity"]["application"]["status"] == "applied"
    again = api.post("/api/applications/", {"opportunityId": opp, "status": "applied"}, format="json")
    assert again.status_code == 200
    stats = api.get("/api/insights/dashboard/").json()["stats"]
    assert (stats["applied"]["value"], stats["applied"]["trend"]) == (9, 2)
    assert api.post("/api/applications/", {"opportunityId": opp, "status": "won"}, format="json").status_code == 400


# --- Emails -------------------------------------------------------------------


def test_email_read_archive_and_filters(api, ids):
    e = ids["em_amazon_jobs"]
    assert (
        api.patch(f"/api/emails/{e}/", {"read": True, "archived": True, "subject": "x"}, format="json")
        .json()["subject"]
        .startswith("New role")
    )
    row = Email.objects.get(pk=e)
    assert row.read and row.archived
    assert api.get("/api/emails/?archived=false").json()["count"] == 26
    assert api.get("/api/emails/?category=Newsletter").json()["count"] == 1
    assert api.get(f"/api/emails/?opportunity={ids['opp_microsoft_explore']}").json()["count"] == 3
    assert api.get("/api/emails/?q=zoho").json()["count"] == 2


def test_extract(api, ids):
    # Already linked → the existing opportunity.
    linked = api.post(f"/api/emails/{ids['em_amazon_jobs']}/extract/").json()
    assert linked["opportunity"]["id"] == ids["opp_amazon_frontend"]
    # Not an opportunity → null.
    assert api.post(f"/api/emails/{ids['em_newsletter']}/extract/").json() == {"opportunity": None}
    # An unlinked opportunity email → a new opportunity from the email's own fields; the rest stays null.
    r = api.post(f"/api/emails/{ids['em_frontend_workshop']}/extract/")
    assert r.status_code == 201
    o = r.json()["opportunity"]
    assert o["title"] == "Frontend Performance Workshop"  # "Invitation: " prefix stripped
    assert o["type"] == "Event" and o["organization"] == "GDG Campus"
    assert o["deadline"] is None and o["location"] is None and o["eligibility"] is None and o["applicationLink"] is None
    assert o["sourceEmailIds"] == [ids["em_frontend_workshop"]]
    assert api.get("/api/opportunities/").json()["count"] == 13


# --- Profile + preferences ----------------------------------------------------


def test_profile_changes_re_explain_matches(api, ids):
    url = f"/api/opportunities/{ids['opp_amazon_frontend']}/"
    assert api.get(url).json()["matchReasons"]["skills"] == "met"
    r = api.patch("/api/auth/me/", {"skills": ["Python", "python", " SQL "]}, format="json")
    assert r.json()["skills"] == ["Python", "SQL"]  # trimmed, de-duplicated
    assert api.get(url).json()["matchReasons"]["skills"] == "unmet"


def test_profile_validation(api):
    assert api.patch("/api/auth/me/", {"name": ""}, format="json").status_code == 400
    assert api.patch("/api/auth/me/", {"skills": ["x" * 61]}, format="json").status_code == 400
    assert api.patch("/api/auth/me/", {"email": "evil@example.com"}, format="json").json()["email"] == "rasmitha@example.com"
    assert api.patch("/api/auth/me/", {"experienceLevel": ""}, format="json").json()["experienceLevel"] is None


def test_preferences_merge_and_validate(api):
    prefs = api.get("/api/preferences/").json()
    assert prefs["notifications"]["weeklyDigest"] is False and prefs["ai"]["personalization"] == "balanced"
    r = api.patch(
        "/api/preferences/",
        {"notifications": {"weeklyDigest": True}, "ai": {"categories": ["Job", "Internship", "Job"]}},
        format="json",
    ).json()
    assert r["notifications"] == {**prefs["notifications"], "weeklyDigest": True}  # other toggles untouched
    assert r["ai"]["categories"] == ["Internship", "Job"]
    assert r["ai"]["recommendations"] is True
    for bad in ({"minimumMatch": 42}, {"language": "fr"}, {"ai": {"personalization": "max"}}, {"ai": {"categories": ["Party"]}}):
        res = api.patch("/api/preferences/", bad, format="json")
        assert res.status_code == 400 and res.json()["error"]["code"] == "validation_error"


def test_recommendations_off_hides_ai_everywhere(api):
    api.patch(
        "/api/preferences/", {"ai": {"recommendations": False}, "notifications": {"deadlineReminders": False}}, format="json"
    )
    assert api.get("/api/insights/dashboard/").json()["recommendation"] is None
    assert api.get("/api/insights/").json()["recommendation"] is None
    assert [n["kind"] for n in api.get("/api/notifications/").json()] == ["new_opportunity"]


# --- Notifications ------------------------------------------------------------


def test_notifications_read_and_clear_persist(api, user):
    items = api.get("/api/notifications/").json()
    assert [n["kind"] for n in items] == ["new_opportunity", "deadline", "ai_recommendation"]
    assert items[1]["body"] == "TCS CodeVita 2026 closes in 2 days."
    assert api.post(f"/api/notifications/{items[0]['id']}/read/").status_code == 204
    assert api.get("/api/notifications/").json()[0]["read"] is True
    api.post("/api/notifications/clear/", {"ids": [n["id"] for n in items]}, format="json")
    assert api.get("/api/notifications/").json() == []
    assert Notification.objects.filter(user=user, cleared=True).count() == 3


# --- Gmail + sync -------------------------------------------------------------


def test_scan_needs_gmail_and_walks_through_phases(api, freeze):
    assert api.post("/api/auth/gmail/disconnect/").json()["status"] == "disconnected"
    r = api.post("/api/sync/")
    assert r.status_code == 409
    assert r.json()["error"] == {
        "code": "gmail_access",
        "message": "We couldn't access your Gmail. Reconnect your account to continue.",
    }

    assert api.post("/api/auth/gmail/connect/").json()["status"] == "connected"
    assert api.post("/api/sync/").json()["phase"] == "scanning"
    freeze(DEMO_NOW + timedelta(seconds=2))
    s = api.get("/api/sync/").json()
    assert s["phase"] == "analyzing" and s["emailsInBatch"] > 0
    freeze(DEMO_NOW + timedelta(seconds=5))
    s = api.get("/api/sync/").json()
    assert s["phase"] == "completed" and s["lastSyncedAt"]


def test_delete_my_data(api, user):
    assert api.delete("/api/auth/me/data/").status_code == 204
    assert api.get("/api/opportunities/").json()["count"] == 0
    assert api.get("/api/emails/").json()["count"] == 0
    assert api.get("/api/deadlines/calendar/").json() == []
    assert not SavedItem.objects.filter(user=user).exists() and not Opportunity.objects.filter(user=user).exists()
    g = GmailConnection.objects.get(user=user)
    assert (g.status, g.sync_phase, g.last_synced_at) == ("disconnected", "idle", None)
    assert api.get("/api/auth/me/").json()["name"] == "Rasmitha"  # the account remains
    assert api.get("/api/insights/dashboard/").json()["stats"]["total"]["value"] == 0


# --- Errors -------------------------------------------------------------------


def test_errors_share_one_shape(api):
    assert api.get("/api/nope/").json() == {"error": {"code": "not_found", "message": "Not found."}}
    assert api.get("/api/opportunities/not-a-uuid/").status_code == 404
    r = api.get("/api/insights/?range=9")
    assert r.status_code == 400 and set(r.json()["error"]) == {"code", "message", "fields"}
    assert api.put("/api/preferences/", {}, format="json").json()["error"]["code"] == "method_not_allowed"
    r = api.post("/api/assistant/", {"question": "x" * 501}, format="json")
    assert r.status_code == 400
