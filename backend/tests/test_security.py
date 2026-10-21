"""Stage 10: rate limits, security headers, no CORS, input limits, token encryption + key rotation."""

import json

import pytest
from cryptography.fernet import Fernet
from django.core.cache import caches
from django.core.management import call_command
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from accounts.models import GmailConnection
from core.crypto import _fernet

from .conftest import TEST_FERNET_KEY, make_client


@pytest.fixture
def rates(monkeypatch):
    """Tight limits for the test (DRF binds rates at import time, so patch the class attribute)."""

    def set_rates(**r):
        base = {"anon": "1000/min", "user": "1000/min", "auth": "1000/min", "sync": "1000/hour", "assistant": "1000/min"}
        monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {**base, **r})

    return set_rates


def test_starting_scans_is_rate_limited_but_polling_is_not(api, rates):
    rates(sync="2/hour")
    assert api.post("/api/sync/").status_code == 202
    assert api.post("/api/sync/").status_code == 202
    r = api.post("/api/sync/")
    assert r.status_code == 429 and "Retry-After" in r.headers
    assert r.json()["error"]["code"] == "rate_limited" and "Please wait" in r.json()["error"]["message"]
    assert all(api.get("/api/sync/").status_code == 200 for _ in range(5))  # status polling unaffected


def test_assistant_is_rate_limited(api, rates):
    rates(assistant="3/min")
    codes = [api.post("/api/assistant/", {"question": "hackathons"}, format="json").status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_sign_in_endpoints_are_rate_limited_per_ip(user, rates):
    rates(auth="2/min")
    c = APIClient(REMOTE_ADDR="127.0.0.1", HTTP_X_FORWARDED_FOR="203.0.113.7")
    assert c.get("/api/auth/google/login/")["Location"].endswith("/dashboard")
    assert c.get("/api/auth/google/login/")["Location"].endswith("/dashboard")
    assert c.get("/api/auth/google/login/")["Location"].endswith("auth_error=rate_limited")
    # Another client (different forwarded IP) isn't affected.
    other = APIClient(REMOTE_ADDR="127.0.0.1", HTTP_X_FORWARDED_FOR="198.51.100.9")
    assert other.get("/api/auth/google/login/")["Location"].endswith("/dashboard")
    assert c.post("/api/auth/dev-login/").status_code == 429


def test_general_limit_for_signed_out_clients(db, rates):
    rates(anon="3/min")
    c = APIClient()
    assert [c.get("/api/auth/csrf/").status_code for _ in range(4)] == [200, 200, 200, 429]


def test_rate_limiter_fails_open_when_its_cache_is_down(api, rates, monkeypatch):
    rates(user="1/min")

    def down(*a, **k):
        raise ConnectionError("cache unreachable")

    for name in ("get", "add", "incr"):
        monkeypatch.setattr(caches["local"], name, down)
    assert [api.get("/api/opportunities/").status_code for _ in range(3)] == [200, 200, 200]


def test_api_security_headers(api):
    r = api.get("/api/opportunities/")
    assert r["Cache-Control"] == "no-store"
    assert (
        r["Content-Security-Policy"].startswith("default-src 'none'") and "frame-ancestors 'none'" in r["Content-Security-Policy"]
    )
    assert r["X-Content-Type-Options"] == "nosniff" and r["X-Frame-Options"] == "DENY"
    assert r["Referrer-Policy"] == "same-origin" and r["Cross-Origin-Opener-Policy"] == "same-origin"
    assert r["Cross-Origin-Resource-Policy"] == "same-origin" and "camera=()" in r["Permissions-Policy"]


def test_no_cors_and_cross_origin_writes_are_refused(user):
    c = APIClient(enforce_csrf_checks=True)
    c.force_login(user)
    r = c.get("/api/opportunities/", HTTP_ORIGIN="https://evil.example")
    assert "Access-Control-Allow-Origin" not in r.headers
    token = c.get("/api/auth/csrf/").json()["csrfToken"]
    r = c.patch(
        "/api/preferences/", {"language": "en"}, format="json", HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN="https://evil.example"
    )
    assert r.status_code == 403  # Origin isn't a trusted origin
    ok = c.patch(
        "/api/preferences/", {"language": "en"}, format="json", HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN="http://localhost:3000"
    )
    assert ok.status_code == 200


def test_oversized_payloads_and_searches_are_refused(api):
    big = json.dumps({"question": "x" * (300 * 1024)})
    assert api.post("/api/assistant/", big, content_type="application/json").status_code in (400, 413)
    r = api.get("/api/opportunities/", {"q": "a" * 201})
    assert r.status_code == 400 and r.json()["error"]["code"] == "validation_error"
    assert api.get("/api/emails/", {"q": "w " * 50}).status_code == 200  # many words: capped, not an error


def test_unknown_fields_and_types_are_rejected(api, ids):
    assert api.patch("/api/preferences/", {"minimumMatch": "50; DROP TABLE"}, format="json").status_code == 400
    assert api.patch("/api/auth/me/", {"interests": "not a list"}, format="json").status_code == 400
    assert api.post("/api/notifications/clear/", {"ids": ["not-a-uuid"]}, format="json").status_code == 400
    assert api.get("/api/opportunities/", {"ordering": "user__email"}).status_code == 200  # unknown ordering ignored
    assert api.get("/api/opportunities/", {"type": "<script>"}).status_code == 400


def test_tokens_are_encrypted_and_the_key_can_be_rotated(api, settings):
    from accounts.models import User

    u = User.objects.create_user("rot@gmail.example", name="R")
    g = u.gmail
    g.set_tokens(refresh_token="1//secret-refresh", access_token="ya29.secret", expiry=None)
    g.save()
    stored = GmailConnection.objects.get(pk=g.pk).refresh_token_enc
    assert "secret-refresh" not in stored

    new_key = Fernet.generate_key().decode()
    settings.TOKEN_ENCRYPTION_KEY = f"{new_key},{TEST_FERNET_KEY}"
    _fernet.cache_clear()
    call_command("rotate_token_key")
    settings.TOKEN_ENCRYPTION_KEY = new_key  # the old key is gone
    _fernet.cache_clear()
    g = GmailConnection.objects.get(pk=g.pk)
    assert g.refresh_token == "1//secret-refresh" and g.access_token == "ya29.secret"


def test_tokens_never_reach_the_client(api, user):
    g = user.gmail
    g.set_tokens(refresh_token="1//never-leaves", access_token="ya29.never-leaves", expiry=None)
    g.save()
    for url in ("/api/auth/gmail/", "/api/auth/me/", "/api/sync/"):
        assert "never-leaves" not in api.get(url).content.decode()


def test_logout_requires_csrf(user):
    c = APIClient(enforce_csrf_checks=True)
    c.force_login(user)
    assert c.post("/api/auth/logout/").status_code == 403
    assert make_client(user).post("/api/auth/logout/").status_code == 204
