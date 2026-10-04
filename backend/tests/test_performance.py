"""
Stage 11: query counts stay constant as the data grows (no N+1 queries).
Each endpoint is measured on the seed, then again after doubling every
opportunity (with its deadline, application, save and emails).
"""

import uuid

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from mail.models import Email
from opportunities.models import Application, Deadline, Opportunity, SavedItem

ENDPOINTS = [
    "/api/auth/me/",
    "/api/preferences/",
    "/api/sync/",
    "/api/notifications/",
    "/api/insights/dashboard/",
    "/api/insights/",
    "/api/opportunities/",
    "/api/emails/",
    "/api/deadlines/calendar/",
    "/api/saved/",
    "/api/digest/",
]

#: Generous ceiling per request; the point is that it doesn't grow with the data.
MAX_QUERIES = 12


def _clone(obj, **overrides):
    obj.pk = uuid.uuid4()
    obj._state.adding = True
    for k, v in overrides.items():
        setattr(obj, k, v)
    obj.save()
    return obj


def _double_the_data(user):
    for o in list(Opportunity.objects.filter(user=user)):
        old_id = o.pk
        new = _clone(o)
        for d in Deadline.objects.filter(opportunity_id=old_id):
            _clone(d, opportunity=new)
        for a in Application.objects.filter(opportunity_id=old_id):
            _clone(a, opportunity=new)
        for s in SavedItem.objects.filter(opportunity_id=old_id):
            _clone(s, opportunity=new)
        for e in Email.objects.filter(opportunity_id=old_id):
            _clone(e, opportunity=new, gmail_message_id=f"{e.gmail_message_id}-copy-{uuid.uuid4().hex[:6]}")


def _count(api, path):
    api.get(path)  # warm up (notifications are derived and upserted on the first read)
    with CaptureQueriesContext(connection) as ctx:
        r = api.get(path)
    assert r.status_code == 200, path
    return len(ctx.captured_queries)


@pytest.mark.django_db
def test_query_counts_do_not_grow_with_data(api, user):
    before = {p: _count(api, p) for p in ENDPOINTS}
    n = Opportunity.objects.filter(user=user).count()
    _double_the_data(user)
    assert Opportunity.objects.filter(user=user).count() == 2 * n
    after = {p: _count(api, p) for p in ENDPOINTS}
    for p in ENDPOINTS:
        assert after[p] == before[p], f"{p}: {before[p]} → {after[p]} queries (N+1?)"
        assert after[p] <= MAX_QUERIES, f"{p}: {after[p]} queries"
