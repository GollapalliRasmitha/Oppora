"""Authentication on every endpoint, CSRF on state-changing requests, the dev login gate."""

import uuid

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

X = str(uuid.uuid4())

ENDPOINTS = [
    ("get", "/api/auth/me/"),
    ("patch", "/api/auth/me/"),
    ("delete", "/api/auth/me/data/"),
    ("get", "/api/auth/gmail/"),
    ("post", "/api/auth/gmail/connect/"),
    ("post", "/api/auth/gmail/disconnect/"),
    ("post", "/api/auth/logout/"),
    ("get", "/api/preferences/"),
    ("patch", "/api/preferences/"),
    ("get", "/api/emails/"),
    ("get", f"/api/emails/{X}/"),
    ("patch", f"/api/emails/{X}/"),
    ("post", f"/api/emails/{X}/extract/"),
    ("get", "/api/opportunities/"),
    ("get", f"/api/opportunities/{X}/"),
    ("patch", f"/api/opportunities/{X}/"),
    ("get", "/api/deadlines/"),
    ("get", "/api/deadlines/calendar/"),
    ("get", "/api/applications/"),
    ("post", "/api/applications/"),
    ("get", "/api/saved/"),
    ("post", "/api/saved/"),
    ("delete", "/api/saved/"),
    ("get", "/api/notifications/"),
    ("post", f"/api/notifications/{X}/read/"),
    ("post", "/api/notifications/clear/"),
    ("get", "/api/insights/"),
    ("get", "/api/insights/dashboard/"),
    ("get", "/api/sync/"),
    ("post", "/api/sync/"),
    ("post", "/api/assistant/"),
]


@pytest.mark.parametrize(("method", "url"), ENDPOINTS)
def test_every_endpoint_requires_a_session(db, method, url):
    r = getattr(APIClient(), method)(url, {}, format="json")
    assert r.status_code == 401
    assert r.json() == {"error": {"code": "not_authenticated", "message": "Your session has expired. Sign in again to continue."}}


def test_state_changes_need_the_csrf_token(user):
    c = APIClient(enforce_csrf_checks=True)
    c.force_login(user)
    r = c.patch("/api/preferences/", {"language": "en"}, format="json")
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "permission_denied"

    token = c.get("/api/auth/csrf/").json()["csrfToken"]
    assert c.patch("/api/preferences/", {"language": "en"}, format="json", HTTP_X_CSRFTOKEN=token).status_code == 200
    # Safe methods don't need it.
    assert c.get("/api/preferences/").status_code == 200


def test_session_cookie_is_httponly_and_samesite(user):
    c = APIClient()
    token = c.get("/api/auth/csrf/").json()["csrfToken"]
    r = c.post("/api/auth/dev-login/", HTTP_X_CSRFTOKEN=token)
    assert r.status_code == 200
    cookie = r.cookies["sessionid"]
    assert cookie["httponly"] and cookie["samesite"] == "Lax"


def test_dev_login_is_csrf_protected(user):
    c = APIClient(enforce_csrf_checks=True)
    assert c.post("/api/auth/dev-login/").status_code == 403
    token = c.get("/api/auth/csrf/").json()["csrfToken"]
    assert c.post("/api/auth/dev-login/", HTTP_X_CSRFTOKEN=token).json()["email"] == "alex@example.com"
    assert c.get("/api/auth/me/").status_code == 200


def test_dev_login_off_outside_debug(user):
    with override_settings(DEV_LOGIN_ENABLED=False):
        r = APIClient().post("/api/auth/dev-login/")
        assert r.status_code == 404


def test_dev_login_without_seed(db):
    r = APIClient().post("/api/auth/dev-login/")
    assert r.status_code == 409
    assert "seed_demo" in r.json()["error"]["message"]


def test_logout_ends_the_session(api):
    assert api.post("/api/auth/logout/").status_code == 204
    assert api.get("/api/auth/me/").status_code == 401
