"""Google sign-in (authorization code + PKCE), Gmail connect/disconnect — Google's endpoints are mocked."""

import base64
import hashlib
from urllib.parse import parse_qs, urlparse

import pytest
import requests
from rest_framework.test import APIClient

from accounts import google
from accounts.models import GmailConnection, User
from mail import sync

from .conftest import make_client


@pytest.fixture
def oauth(settings, monkeypatch):
    settings.GOOGLE_CLIENT_ID = "client-123.apps.googleusercontent.com"
    settings.GOOGLE_CLIENT_SECRET = "secret-xyz"
    settings.GOOGLE_OAUTH_ENABLED = True
    settings.DEV_LOGIN_ENABLED = False
    settings.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/auth/google/callback"
    calls = {"token": [], "revoke": [], "syncs": []}
    scopes = " ".join(settings.GOOGLE_SCOPES)
    state = {"scope": scopes, "refresh": "1//refresh-from-google"}

    def fake_post(url, data=None, timeout=None, **kw):
        r = requests.Response()
        r.status_code = 200
        if url == google.TOKEN_URI:
            calls["token"].append(data)
            r._content = b'{"access_token": "ya29.new", "expires_in": 3599, "id_token": "jwt", "scope": "%s"%s}' % (
                state["scope"].encode(),
                b', "refresh_token": "%s"' % state["refresh"].encode() if state["refresh"] else b"",
            )
        elif url == google.REVOKE_URI:
            calls["revoke"].append(data)
            r._content = b"{}"
        return r

    monkeypatch.setattr(google.requests, "post", fake_post)
    monkeypatch.setattr(
        google.id_token,
        "verify_oauth2_token",
        lambda token, req, aud: {
            "sub": "g-42",
            "email": "Me@Gmail.example",
            "email_verified": True,
            "given_name": "Rasmitha",
            "aud": aud,
        },
    )
    monkeypatch.setattr(sync, "run_sync", lambda user_id: calls["syncs"].append(user_id))
    return calls, state


def start(client, **params):
    r = client.get("/api/auth/google/login/", params)
    assert r.status_code == 302
    return r, parse_qs(urlparse(r["Location"]).query)


def test_login_redirects_to_google_with_minimum_scopes_offline_and_pkce(db, oauth):
    c = APIClient()
    r, q = start(c, next="/opportunities")
    assert r["Location"].startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert q["scope"] == [
        "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile "
        "https://www.googleapis.com/auth/gmail.readonly"
    ]
    assert q["access_type"] == ["offline"] and q["prompt"] == ["consent"] and q["code_challenge_method"] == ["S256"]
    assert q["redirect_uri"] == ["http://localhost:3000/api/auth/google/callback"]
    pending = c.session[google.SESSION_KEY]
    assert q["state"] == [pending["state"]] and pending["next"] == "/opportunities"
    challenge = base64.urlsafe_b64encode(hashlib.sha256(pending["verifier"].encode()).digest()).rstrip(b"=").decode()
    assert q["code_challenge"] == [challenge]


def test_callback_signs_in_stores_encrypted_tokens_and_starts_the_first_scan(db, oauth):
    calls, _ = oauth
    c = APIClient()
    _, q = start(c, next="/dashboard")
    r = c.get("/api/auth/google/callback/", {"state": q["state"][0], "code": "auth-code"})
    assert r.status_code == 302 and r["Location"] == "http://localhost:3000/dashboard"

    token_req = calls["token"][0]
    assert token_req["code"] == "auth-code" and token_req["code_verifier"] and token_req["grant_type"] == "authorization_code"
    user = User.objects.get(email="me@gmail.example")
    g = GmailConnection.objects.get(user=user)
    assert (g.status, g.google_sub, g.is_demo) == ("connected", "g-42", False)
    assert g.refresh_token == "1//refresh-from-google" and "refresh-from-google" not in g.refresh_token_enc
    assert set(g.scopes) == {"openid", "email", "profile", "gmail.readonly"}
    assert calls["syncs"] == [user.pk]
    assert c.get("/api/auth/me/").json()["email"] == "me@gmail.example"  # session is live
    assert google.SESSION_KEY not in c.session  # state can't be replayed


@pytest.mark.parametrize(
    ("params", "code"),
    [
        ({"state": "forged", "code": "c"}, "state_mismatch"),
        ({"error": "access_denied"}, "access_denied"),
    ],
)
def test_callback_rejects_forged_or_denied(db, oauth, params, code):
    c = APIClient()
    start(c)
    r = c.get("/api/auth/google/callback/", params)
    assert r["Location"] == f"http://localhost:3000/?auth_error={code}"
    assert c.get("/api/auth/me/").status_code == 401


def test_callback_without_a_started_sign_in_is_rejected(db, oauth):
    r = APIClient().get("/api/auth/google/callback/", {"state": "x", "code": "c"})
    assert r["Location"].endswith("auth_error=state_mismatch")


def test_unticked_gmail_permission_signs_in_without_connecting(db, oauth):
    _, state = oauth
    state["scope"] = "openid https://www.googleapis.com/auth/userinfo.email"
    c = APIClient()
    _, q = start(c)
    r = c.get("/api/auth/google/callback/", {"state": q["state"][0], "code": "c"})
    assert r["Location"].endswith("/settings?gmail_error=scope_missing#gmail")
    g = GmailConnection.objects.get(user__email="me@gmail.example")
    assert g.status == "disconnected" and not g.refresh_token_enc


def test_next_must_stay_on_site(db, oauth):
    c = APIClient()
    _, q = start(c, next="//evil.example/steal")
    r = c.get("/api/auth/google/callback/", {"state": q["state"][0], "code": "c"})
    assert r["Location"] == "http://localhost:3000/dashboard"
    assert google.safe_next("https://evil.example") == "/dashboard" and google.safe_next("/\\evil") == "/dashboard"


def test_connect_with_a_different_google_account_is_refused(db, oauth):
    calls, _ = oauth
    other = User.objects.create_user("someone.else@gmail.example", name="X")
    c = make_client(other)
    _, q = start(c, intent="connect", next="/settings")
    r = c.get("/api/auth/google/callback/", {"state": q["state"][0], "code": "c"})
    assert r["Location"].endswith("gmail_error=account_mismatch#gmail")
    assert calls["revoke"]  # the unexpected grant is given back
    assert c.get("/api/auth/me/").json()["email"] == "someone.else@gmail.example"


def test_connect_endpoint_redirects_real_accounts_and_simulates_the_demo(user, oauth):
    real = User.objects.create_user("real@gmail.example", name="R")
    r = make_client(real).post("/api/auth/gmail/connect/")
    assert r.json() == {"redirect": "/api/auth/google/login?intent=connect&next=/settings%3Fgmail%3Dconnected%23gmail"}
    demo = make_client(user).post("/api/auth/gmail/connect/").json()
    assert demo["status"] == "connected"


def test_disconnect_revokes_and_deletes_tokens(db, oauth):
    calls, _ = oauth
    c = APIClient()
    _, q = start(c)
    c.get("/api/auth/google/callback/", {"state": q["state"][0], "code": "c"})
    r = c.post("/api/auth/gmail/disconnect/")
    assert r.json()["status"] == "disconnected"
    assert calls["revoke"] == [{"token": "1//refresh-from-google"}]
    g = GmailConnection.objects.get(user__email="me@gmail.example")
    assert not g.refresh_token_enc and not g.access_token_enc and not g.history_id


def test_dev_sign_in_is_off_once_google_is_configured(user, oauth):
    assert APIClient().post("/api/auth/dev-login/").status_code == 404


def test_without_google_the_button_signs_in_the_demo_user(user, settings):
    settings.GOOGLE_OAUTH_ENABLED = False
    settings.DEV_LOGIN_ENABLED = True
    c = APIClient()
    r = c.get("/api/auth/google/login/", {"next": "/inbox"})
    assert r["Location"] == "http://localhost:3000/inbox"
    assert c.get("/api/auth/me/").json()["email"] == "rasmitha@example.com"
    settings.DEV_LOGIN_ENABLED = False
    assert APIClient().get("/api/auth/google/login/")["Location"].endswith("auth_error=not_configured")


def test_gmail_client_refreshes_expired_tokens_and_reports_revoked_ones(db, oauth, monkeypatch):
    from datetime import UTC, datetime, timedelta

    from google.auth.exceptions import RefreshError

    from mail import gmail as gm

    user = User.objects.create_user("t@gmail.example", name="T")
    g = user.gmail
    g.set_tokens(refresh_token="1//r", access_token="old", expiry=datetime.now(tz=UTC) - timedelta(minutes=5))
    g.save()

    def refresh(self, request):
        self.token, self.expiry = "fresh", datetime.now(tz=UTC).replace(tzinfo=None) + timedelta(hours=1)

    monkeypatch.setattr(gm.Credentials, "refresh", refresh)
    monkeypatch.setattr(gm, "build", lambda *a, **k: "service")
    assert gm.GmailClient.for_connection(g)._svc == "service"
    g.refresh_from_db()
    assert g.access_token == "fresh" and g.token_expiry > datetime.now(tz=UTC)

    g.token_expiry = datetime.now(tz=UTC) - timedelta(minutes=1)
    g.save()

    def revoked(self, request):
        raise RefreshError("invalid_grant: Token has been expired or revoked.")

    monkeypatch.setattr(gm.Credentials, "refresh", revoked)
    with pytest.raises(gm.GmailAuthError):
        gm.GmailClient.for_connection(g)
    g.clear_tokens()
    with pytest.raises(gm.GmailAuthError):
        gm.GmailClient.for_connection(g)
