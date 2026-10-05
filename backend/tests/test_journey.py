"""
Stage 12: the whole user journey in one test, through the real API, pipeline
and scheduled tasks. Only Google's endpoints, the Gmail API and the AI model
are faked:

landing sign-in → Google consent → callback → first Gmail scan → AI analysis →
opportunity on the dashboard → details → save → apply → deadline reminder in
the bell → AI assistant.
"""

from datetime import datetime
from urllib.parse import parse_qs, urlparse

import pytest
import requests
from rest_framework.test import APIClient

from accounts import google
from accounts.models import GmailConnection, User
from notifications.tasks import deadline_reminders

from .conftest import KOLKATA
from .gmail_fakes import message
from .test_pipeline import INTERNSHIP, extraction

START = datetime(2026, 10, 2, 9, 30, tzinfo=KOLKATA)


@pytest.fixture
def google_oauth(settings, monkeypatch):
    """Google's token endpoint and ID-token check, faked. The first scan is NOT stubbed: it really runs."""
    settings.GOOGLE_CLIENT_ID = "client-123.apps.googleusercontent.com"
    settings.GOOGLE_CLIENT_SECRET = "secret-xyz"
    settings.GOOGLE_OAUTH_ENABLED = True
    settings.DEV_LOGIN_ENABLED = False
    settings.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/auth/google/callback"
    scopes = " ".join(settings.GOOGLE_SCOPES)

    def fake_post(url, data=None, timeout=None, **kw):
        r = requests.Response()
        r.status_code = 200
        r._content = (
            b'{"access_token": "ya29.new", "expires_in": 3599, "id_token": "jwt", "scope": "%s", "refresh_token": "1//r"}'
            % scopes.encode()
            if url == google.TOKEN_URI
            else b"{}"
        )
        return r

    monkeypatch.setattr(google.requests, "post", fake_post)
    monkeypatch.setattr(
        google.id_token,
        "verify_oauth2_token",
        lambda token, req, aud: {"sub": "g-7", "email": "student@gmail.example", "email_verified": True, "given_name": "Asha"},
    )


def test_complete_user_journey(db, freeze, google_oauth, gmail, fake_ai):
    freeze(START)
    gmail.messages = {
        m["id"]: m
        for m in [
            INTERNSHIP,  # "Frontend Internship 2027", apply by 20 October 2026
            message("p1", subject="40% off all courses", text="Big sale!", labels=["CATEGORY_PROMOTIONS"]),
        ]
    }
    fake_ai.push(extraction())

    # 1. Landing → "Sign in with Google" → Google's consent screen (gmail.readonly only, PKCE).
    browser = APIClient()
    r = browser.get("/api/auth/google/login/", {"next": "/dashboard"})
    assert r.status_code == 302 and r["Location"].startswith("https://accounts.google.com/")
    q = parse_qs(urlparse(r["Location"]).query)
    assert "https://www.googleapis.com/auth/gmail.readonly" in q["scope"][0] and "gmail.modify" not in q["scope"][0]

    # 2. Google redirects back → signed in, Gmail connected → the AI consent screen, before any scan.
    r = browser.get("/api/auth/google/callback/", {"state": q["state"][0], "code": "auth-code"})
    assert r.status_code == 302 and r["Location"].endswith("/welcome?next=/dashboard")
    user = User.objects.get(email="student@gmail.example")
    assert user.gmail.status == GmailConnection.Status.CONNECTED and not user.gmail.is_demo
    assert browser.get("/api/auth/me/").json()["aiMode"] == "ask"
    assert browser.post("/api/sync/").status_code == 409  # no scan without an answer
    assert not fake_ai.calls

    # The user reads the consent screen and chooses "Continue" (Gemini); the screen starts the first scan.
    assert browser.patch("/api/preferences/", {"ai": {"mode": "ai"}}, format="json").json()["ai"]["mode"] == "ai"
    assert browser.post("/api/sync/").status_code == 202  # jobs are eager in tests: the scan runs now

    # 3. Gmail sync + AI analysis: one AI call (the promotion never reaches the AI), nothing queued.
    sync = browser.get("/api/sync/").json()
    assert sync["phase"] == "completed" and sync["queued"] == 0
    assert len(fake_ai.calls) == 1

    # 4. The opportunity is on the dashboard and in the list.
    dash = browser.get("/api/insights/dashboard/").json()
    assert dash["stats"]["total"]["value"] == 1
    [opp] = browser.get("/api/opportunities/").json()["results"]
    assert (opp["title"], opp["organization"], opp["type"]) == ("Frontend Internship 2027", "Acme", "Internship")

    # 5. Details: grounded fields, unknowns stay null, the match is explained.
    d = browser.get(f"/api/opportunities/{opp['id']}/").json()
    assert d["deadline"] == "2026-10-20"
    assert d["applicationLink"] == "https://acme.example/careers/frontend-intern"
    assert d["location"] is None  # not in the email → "Not mentioned in email"
    assert d["scoreBreakdown"]["score"] == d["matchScore"]
    assert {p["key"] for p in d["scoreBreakdown"]["parts"]} == {"interests", "skills", "experience", "deadline"}

    # 6. Save.
    assert browser.post("/api/saved/", {"opportunityId": opp["id"]}, format="json").status_code in (200, 201)
    assert browser.get(f"/api/opportunities/{opp['id']}/").json()["saved"] is True

    # 7. Apply (Apply Now → "Mark as applied").
    r = browser.post("/api/applications/", {"opportunityId": opp["id"], "status": "applied"}, format="json")
    assert r.status_code in (200, 201)
    assert browser.get(f"/api/opportunities/{opp['id']}/").json()["application"]["status"] == "applied"

    # 8. Set a reminder; the day before the deadline at 09:00 local, it lands in the bell.
    assert browser.patch(f"/api/opportunities/{opp['id']}/", {"reminderSet": True}, format="json").status_code == 200
    freeze(datetime(2026, 10, 19, 9, 5, tzinfo=KOLKATA))
    assert deadline_reminders() == 1
    assert deadline_reminders() == 0  # re-runs never duplicate
    bell = browser.get("/api/notifications/").json()
    bell = bell["results"] if isinstance(bell, dict) else bell
    assert any(n["body"] == "Frontend Internship 2027 closes tomorrow." for n in bell)

    # 9. Ask the AI assistant: it answers from the user's own data and links what it used.
    ans = browser.post("/api/assistant/", {"question": "What deadlines are approaching?"}, format="json").json()
    assert ans["text"].startswith("1 deadline is coming up in the next 7 days")
    assert any(
        link["href"] == f"/opportunities/{opp['id']}" and link["title"] == "Frontend Internship 2027" for link in ans["links"]
    )
