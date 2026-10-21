"""
Security events to GuardRail (guardrail/client.py). GuardRail itself is never called: requests.post is replaced.
The rule these prove: monitoring never slows down or breaks Oppora, and never sends personal data.
"""

import json
from types import SimpleNamespace
from unittest import mock

import pytest
import requests
from rest_framework.test import APIClient

from guardrail import client
from guardrail.models import OutboxEvent

from .test_google import oauth, start  # noqa: F401  (the faked Google sign-in)
from .test_security import rates  # noqa: F401

SECRET = "test-guardrail-secret-0123456789abcdefgh"


def answer(status: int) -> mock.Mock:
    return mock.Mock(status_code=status, text="")


@pytest.fixture
def guardrail_on(settings):
    settings.GUARDRAIL_ENABLED = True
    settings.GUARDRAIL_URL = "http://guardrail.test"
    settings.GUARDRAIL_SECRET = SECRET
    settings.GUARDRAIL_SYNC = True  # send inline, so tests are deterministic


@pytest.fixture
def post(monkeypatch):
    """Replace only GuardRail's view of `requests` (the fake Google sign-in replaces requests.post for itself)."""
    fake = mock.Mock(return_value=answer(202))
    monkeypatch.setattr(client, "requests", SimpleNamespace(post=fake, RequestException=requests.RequestException))
    return fake


def sent(post) -> list[dict]:
    return [e for c in post.call_args_list for e in json.loads(c.kwargs["data"])["events"]]


# --- the client ------------------------------------------------------------------------------------------------------


def test_signature_matches_guardrails_reference_vector():
    # Same value as GuardRail's own test (lib/ingest/signature.test.ts) and HomeHaat's: computed independently.
    assert client.sign("test-secret", 1700000000, "00ff", b'{"events":[]}') == (
        "884ff67b8f561c7c4b1a8cd935409f9dd97be53755625abbb4e60bea4262e583"
    )


def test_events_are_masked_and_carry_uid_and_actor_id(guardrail_on):
    e = client.build_event("login_failed", actor="Priya.Sharma@Gmail.com", path="/x/?token=SECRET", meta={"password": "p"})
    assert e["actor"] == "pr****@gmail.com"
    assert e["path"] == "/x/"
    assert "meta" not in e  # nothing allow-listed was given
    assert len(e["uid"]) == 32 and e["uid"] != client.build_event("login_failed")["uid"]
    assert e["actor_id"] == client.build_event("x", actor="priya.sharma@gmail.com")["actor_id"]
    assert "SECRET" not in json.dumps(e) and "priya.sharma" not in json.dumps(e)


def test_signed_request_with_short_timeout(guardrail_on, post):
    assert client.send_batch([client.build_event("login_failed")]) == "ok"
    kwargs = post.call_args.kwargs
    assert post.call_args.args[0] == "http://guardrail.test/api/ingest"
    assert kwargs["timeout"] <= 2
    h = kwargs["headers"]
    assert h["X-GuardRail-Source"] == "oppora"
    assert h["X-GuardRail-Signature"] == client.sign(
        SECRET, int(h["X-GuardRail-Timestamp"]), h["X-GuardRail-Nonce"], kwargs["data"]
    )


@pytest.mark.django_db
def test_guardrail_down_or_busy_goes_to_outbox_refused_is_dropped(guardrail_on, post):
    post.side_effect = requests.ConnectionError("down")
    client.report("login_failed")
    post.side_effect = None
    post.return_value = answer(503)
    client.report("login_failed")
    post.return_value = answer(400)
    client.report("login_failed")
    assert OutboxEvent.objects.count() == 2


@pytest.mark.django_db
def test_outbox_is_resent_with_the_same_uid(guardrail_on, post):
    post.side_effect = requests.Timeout("slow")
    client.report("suspicious_path", path="/.env")
    uid = OutboxEvent.objects.get().payload["uid"]
    post.side_effect = None
    assert client.flush_outbox() == {"sent": 1, "dropped": 0, "waiting": 0}
    assert sent(post)[-1]["uid"] == uid


@pytest.mark.django_db
def test_switched_off_sends_nothing(settings, post):
    settings.GUARDRAIL_ENABLED = False
    client.report("login_failed")
    post.assert_not_called()
    assert OutboxEvent.objects.count() == 0


def test_a_bug_inside_report_never_reaches_the_caller(guardrail_on, monkeypatch):
    monkeypatch.setattr(client, "build_event", mock.Mock(side_effect=RuntimeError("boom")))
    client.report("login_failed")  # must not raise


# --- the hooks in Oppora -----------------------------------------------------------------------------------------------


def test_successful_google_sign_in_is_reported_with_masked_email(db, oauth, guardrail_on, post):  # noqa: F811
    c = APIClient(REMOTE_ADDR="127.0.0.1", HTTP_X_FORWARDED_FOR="203.0.113.5")
    _, q = start(c)
    r = c.get("/api/auth/google/callback/", {"state": q["state"][0], "code": "c"})
    assert r.status_code == 302 and "auth_error" not in r["Location"]  # unchanged
    [event] = sent(post)
    assert event["type"] == "login_success"
    assert event["actor"] == "me****@gmail.example"
    assert event["ip"] == "203.0.113.5"  # the visitor's IP, as Oppora's own rate limit sees it


def test_forged_callback_is_a_failed_login_but_cancel_is_not(db, oauth, guardrail_on, post):  # noqa: F811
    c = APIClient()
    r = c.get("/api/auth/google/callback/", {"state": "forged", "code": "c"})
    assert r["Location"].endswith("auth_error=state_mismatch")  # unchanged
    [event] = sent(post)
    assert event["type"] == "login_failed"
    assert event["meta"] == {"reason": "state_mismatch"}

    post.reset_mock()
    _, q = start(c)
    c.get("/api/auth/google/callback/", {"state": q["state"][0], "error": "access_denied"})
    assert sent(post) == []  # pressing "Cancel" on Google's screen isn't an attack


def test_sign_in_rate_limit_is_reported(user, rates, guardrail_on, post):  # noqa: F811
    rates(auth="1/min")
    c = APIClient(REMOTE_ADDR="127.0.0.1", HTTP_X_FORWARDED_FOR="203.0.113.8")
    c.get("/api/auth/google/login/")
    assert c.get("/api/auth/google/login/")["Location"].endswith("auth_error=rate_limited")
    events = [e for e in sent(post) if e["type"] == "rate_limited"]
    assert len(events) == 1 and events[0]["ip"] == "203.0.113.8"


def test_demo_visitors_are_never_reported(user, settings, guardrail_on, post):
    settings.PUBLIC_DEMO_ENABLED = True
    settings.DEMO_READ_ONLY = True
    c = APIClient()
    c.get("/api/auth/demo/")  # sign in to the shared demo
    c.patch("/api/preferences/", {"theme": "light"}, format="json")  # refused: read-only demo
    assert sent(post) == []


def test_scanner_paths_and_wrong_cron_secret_are_reported(db, settings, guardrail_on, post):
    settings.CRON_SECRET = "s" * 40
    c = APIClient()
    assert c.get("/.env").status_code == 404
    assert c.get("/wp-admin/").status_code == 404
    assert c.post("/api/cron/", HTTP_AUTHORIZATION="Bearer guess").status_code == 401
    types = [(e["type"], e.get("meta")) for e in sent(post)]
    assert types == [
        ("suspicious_path", None),
        ("suspicious_path", None),
        ("permission_denied", {"reason": "cron_secret"}),
    ]


def test_normal_requests_are_not_reported(api, guardrail_on, post):
    api.get("/api/insights/dashboard/")
    api.get("/api/no-such-thing/")
    assert sent(post) == []


def test_sign_in_still_works_when_guardrail_is_down(db, oauth, guardrail_on, post):  # noqa: F811
    post.side_effect = requests.ConnectionError("GuardRail is down")
    c = APIClient()
    _, q = start(c)
    r = c.get("/api/auth/google/callback/", {"state": q["state"][0], "code": "c"})
    assert r.status_code == 302 and "auth_error" not in r["Location"]
    assert c.get("/api/auth/me/").json()["email"] == "me@gmail.example"
