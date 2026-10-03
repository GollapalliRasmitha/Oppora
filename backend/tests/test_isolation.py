"""
PROMPT.md §6: user A can never read or change user B's data. Both users get
the full demo seed, then B tries every endpoint with A's ids.
"""

import pytest

from core.seed import load_seed
from mail.models import Email
from notifications.models import Notification
from opportunities.models import Application, Opportunity, SavedItem

from .conftest import DEMO_NOW, exported_for, make_client


@pytest.fixture
def two_users(db, freeze):
    freeze(DEMO_NOW)
    exported = exported_for(DEMO_NOW.date())
    a, a_ids = load_seed(exported, "a@example.com")
    b, b_ids = load_seed(exported, "b@example.com")
    return (a, a_ids, make_client(a)), (b, b_ids, make_client(b))


def test_lists_only_show_your_own_rows(two_users):
    (a, _, api_a), (b, _, api_b) = two_users
    a_opps = {str(i) for i in Opportunity.objects.filter(user=a).values_list("id", flat=True)}
    a_emails = {str(i) for i in Email.objects.filter(user=a).values_list("id", flat=True)}
    api_a.get("/api/notifications/")  # A's notifications exist too

    seen = set()
    for url in ["/api/opportunities/?dismissed=false", "/api/emails/?page_size=200", "/api/applications/", "/api/deadlines/"]:
        for row in api_b.get(url).json()["results"]:
            seen |= {row["id"], row.get("opportunityId")}
    for row in api_b.get("/api/saved/").json():
        seen |= {row["opportunityId"], row["emailId"]}
    for row in api_b.get("/api/deadlines/calendar/").json():
        seen.add(row["opportunityId"])
    for row in api_b.get("/api/notifications/").json():
        seen |= {row["id"], row["opportunityId"]}
    dash = api_b.get("/api/insights/dashboard/").json()
    seen |= {o["id"] for o in dash["latest"] + dash["upcoming"]} | set(dash["recommendation"]["matchIds"])

    assert not seen & (a_opps | a_emails)
    assert dash["stats"]["total"]["value"] == 12  # B's own 12, not 24


def test_cannot_read_or_change_another_users_rows(two_users):
    (a, a_ids, _), (_, _, api_b) = two_users
    opp = a_ids["opp_amazon_frontend"]
    email = a_ids["em_amazon_jobs"]

    assert api_b.get(f"/api/opportunities/{opp}/").status_code == 404
    assert api_b.patch(f"/api/opportunities/{opp}/", {"dismissed": True}, format="json").status_code == 404
    assert api_b.get(f"/api/emails/{email}/").status_code == 404
    assert api_b.patch(f"/api/emails/{email}/", {"archived": True}, format="json").status_code == 404
    assert api_b.post(f"/api/emails/{email}/extract/").status_code == 404
    assert api_b.get(f"/api/emails/?opportunity={opp}").json()["count"] == 0

    # Related ids in request bodies must belong to the requester.
    r = api_b.post("/api/saved/", {"opportunityId": opp}, format="json")
    assert r.status_code == 400 and "opportunityId" in r.json()["error"]["fields"]
    assert api_b.post("/api/saved/", {"emailId": email}, format="json").status_code == 400
    assert api_b.delete(f"/api/saved/?opportunityId={opp}").status_code == 400
    assert api_b.post("/api/applications/", {"opportunityId": opp, "status": "applied"}, format="json").status_code == 400

    make_client(a).get("/api/notifications/")
    a_note = Notification.objects.filter(user=a).first()
    assert api_b.post(f"/api/notifications/{a_note.id}/read/").status_code == 404
    assert api_b.post("/api/notifications/clear/", {"ids": [str(a_note.id)]}, format="json").status_code == 204

    # The assistant only looks at the requester's data, even with A's id as context.
    ans = api_b.post(
        "/api/assistant/", {"question": "Why is this opportunity relevant?", "opportunityId": opp}, format="json"
    ).json()
    assert all(opp not in link["href"] for link in ans["links"])

    # Nothing of A's changed.
    o = Opportunity.objects.get(pk=opp)
    assert not o.dismissed
    assert not Email.objects.get(pk=email).archived
    assert SavedItem.objects.filter(user=a).count() == 7
    assert not Application.objects.filter(opportunity=o).exists()
    a_note.refresh_from_db()
    assert not a_note.cleared
