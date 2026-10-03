"""
The brief's dashboard targets (PROMPT.md §4) through the real API, on several
dates and times of day, including month/year boundaries and a leap day.
"""

from datetime import datetime

import pytest

from core.domain.dates import parse_dt
from core.seed import load_seed

from .conftest import KOLKATA, exported_for, make_client

DEMO_DAYS = [
    datetime(2026, 10, 2, 9, 30, tzinfo=KOLKATA),
    datetime(2026, 10, 2, 0, 5, tzinfo=KOLKATA),
    datetime(2026, 10, 2, 23, 55, tzinfo=KOLKATA),
    datetime(2027, 1, 1, 12, 0, tzinfo=KOLKATA),
    datetime(2028, 2, 29, 18, 0, tzinfo=KOLKATA),
]


@pytest.fixture(params=DEMO_DAYS, ids=lambda d: d.strftime("%Y-%m-%d_%H%M"))
def demo(request, db, freeze):
    now = freeze(request.param)
    user, ids = load_seed(exported_for(now.date()))
    return make_client(user), now


def test_dashboard_targets(demo):
    api, _ = demo
    d = api.get("/api/insights/dashboard/").json()
    s = d["stats"]
    assert (s["total"]["value"], s["total"]["trend"]) == (12, 2)
    assert (s["deadlinesThisWeek"]["value"], s["deadlinesThisWeek"]["urgent"]) == (4, 2)
    assert (s["applied"]["value"], s["applied"]["trend"]) == (8, 1)
    assert (s["inProgress"]["value"], s["inProgress"]["trend"]) == (3, 1)
    assert s["saved"] == 7
    assert sorted(o["title"] for o in d["latest"]) == sorted(
        [
            "Frontend Developer",
            "Google Summer Internship 2027",
            "Microsoft Explore",
            "TCS CodeVita 2026",
            "Women Techmakers Scholarship",
        ]
    )
    assert [o["title"] for o in d["upcoming"]] == [
        "TCS CodeVita 2026",
        "Microsoft Explore",
        "Women Techmakers Scholarship",
        "Frontend Developer",
    ]
    assert d["recommendation"]["message"] == (
        "I found 3 opportunities that strongly match your interests. Two have deadlines coming up soon."
    )


def test_seed_integrity(demo):
    api, now = demo
    opps = api.get("/api/opportunities/").json()["results"]
    emails = api.get("/api/emails/?page_size=200").json()["results"]
    email_ids = {e["id"] for e in emails}
    for o in opps:
        assert o["sourceEmailIds"] and set(o["sourceEmailIds"]) <= email_ids
    stamps = [e["receivedAt"] for e in emails] + [o["discoveredAt"] for o in opps]
    stamps += [t for o in opps if o["application"] for t in (o["application"]["startedAt"], o["application"]["appliedAt"]) if t]
    assert all(parse_dt(t) <= now for t in stamps), "nothing is received/discovered/applied in the future"
    cats = {e["category"] for e in emails}
    assert {"Newsletter", "College", "Promotion"} <= cats
    assert any(e["read"] for e in emails) and any(not e["read"] for e in emails)
