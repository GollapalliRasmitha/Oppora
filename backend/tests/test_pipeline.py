"""Stage 8 pipeline: content, pre-filter, validation, rate limits, providers and the sync — all offline."""

from datetime import UTC, datetime, timedelta

import pytest
import requests

from accounts.models import GmailConnection, User
from ai import client as ai_client
from ai.extract import extract, validate
from ai.models import AIUsage
from ai.providers.base import DailyLimitReached, InvalidOutput, NotConfigured, RateLimited, TransientAIError
from ai.providers.fake import FakeProvider
from ai.providers.gemini import GeminiProvider
from ai.providers.openai import OpenAIProvider
from ai.schema import EXTRACTION_SCHEMA, for_openai
from mail import sync
from mail.content import clean_text, parse_message
from mail.models import Email, ProcessedMessage
from mail.prefilter import prefilter
from opportunities.models import Deadline, Interview, Opportunity

from .conftest import KOLKATA, make_client
from .gmail_fakes import message

NOW = datetime(2026, 10, 2, 9, 30, tzinfo=KOLKATA)

INTERNSHIP = message(
    "m1",
    subject="Frontend Internship 2027 — applications open",
    text=(
        "Hi! Acme is hiring frontend interns for summer 2027.\n"
        "We use React and TypeScript. Apply by 20 October 2026: https://acme.example/careers/frontend-intern\n"
        "Open to undergraduate students.\n\n-- \nAcme Careers, 1 Main St"
    ),
    attachment="SECRET-ATTACHMENT-TEXT internship",
)


def extraction(**over) -> dict:
    out = {
        "category": "Internship",
        "is_opportunity": True,
        "relevance": 90,
        "priority": None,
        "summary": "Acme is hiring frontend interns for summer 2027.",
        "organization": "Acme",
        "opportunity_name": "Frontend Internship 2027",
        "deadline": "2026-10-20",
        "eligibility": "Open to undergraduate students.",
        "location": None,
        "duration": None,
        "skills": ["React", "TypeScript"],
        "requirements": [],
        "benefits": [],
        "application_link": "https://acme.example/careers/frontend-intern",
        "action_required": "Apply by 20 October 2026.",
        "interview": None,
        "fee": None,
        "confidence": 0.95,
    }
    return {**out, **over}


# --- Content -----------------------------------------------------------------------


def test_parse_keeps_minimum_and_never_reads_attachments():
    m = parse_message(INTERNSHIP, max_body_chars=4000)
    assert (
        m.subject.startswith("Frontend Internship")
        and m.sender_email == "careers@acme.example"
        and m.sender_name == "Careers Team"
    )
    assert "SECRET-ATTACHMENT-TEXT" not in m.body  # attachment never read
    assert "Acme Careers, 1 Main St" not in m.body  # signature stripped
    assert m.urls == ["https://acme.example/careers/frontend-intern"]


def test_html_bodies_keep_link_targets_and_drop_scripts():
    msg = message(
        "h1",
        subject="Hackathon",
        html='<style>p{}</style><p>Join <a href="https://hack.example/register">our hackathon</a></p><script>x()</script>',
    )
    m = parse_message(msg, 4000)
    assert "our hackathon (https://hack.example/register)" in m.body and "x()" not in m.body and "p{}" not in m.body


def test_quoted_replies_and_length_are_trimmed():
    assert clean_text("Thanks!\nOn Mon, 1 Oct 2026 at 10:00, Bob <b@x.com> wrote:\n> old stuff", 100) == "Thanks!"
    long = clean_text("word " * 2000, 120)
    assert len(long) <= 122 and long.endswith("…")


# --- Pre-filter ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("msg", "reason"),
    [
        (message("a", subject="Party pics", text="see photos", labels=["CATEGORY_SOCIAL"]), "label"),
        (message("b", subject="50% off everything", text="Huge sale this weekend", labels=["CATEGORY_PROMOTIONS"]), "promotion"),
        (message("c", subject="Lunch?", text="Pizza at 1?", sender="Sam <sam@friends.example>"), "no_opportunity_words"),
        (INTERNSHIP, None),
        # A promotion that is really an opportunity still goes to the AI.
        (message("d", subject="Internship drive — 20% stipend raise", text="Apply now", labels=["CATEGORY_PROMOTIONS"]), None),
    ],
)
def test_prefilter(msg, reason):
    assert prefilter(parse_message(msg, 4000)) == reason


# --- Validation (never guess) -------------------------------------------------------------


def test_validation_drops_what_the_email_does_not_support():
    m = parse_message(INTERNSHIP, 4000)
    x = validate(
        extraction(
            application_link="https://evil.example/phish",
            skills=["React", "Kubernetes"],
            deadline="2031-01-01",
            interview={"start": "not a date", "end": None, "location": None},
        ),
        m,
        KOLKATA,
    )
    assert x.application_link is None and x.skills == ["React"] and x.deadline is None and x.interview is None
    assert set(x.dropped) == {"application_link", "skills", "deadline", "interview"}


def test_validation_rejects_malformed_output():
    m = parse_message(INTERNSHIP, 4000)
    with pytest.raises(InvalidOutput):
        validate({"category": "Internship"}, m, KOLKATA)
    with pytest.raises(InvalidOutput):
        validate(extraction(category="Party"), m, KOLKATA)
    with pytest.raises(InvalidOutput):
        validate(extraction(relevance="very"), m, KOLKATA)
    # Not an opportunity type → can't be an opportunity, whatever the flag says.
    assert validate(extraction(category="Newsletter"), m, KOLKATA).is_opportunity is False


def test_extract_sends_only_the_minimum_and_retries_invalid_output_once(fake_ai, real_user, settings):
    settings.AI_MAX_BODY_CHARS = 60
    m = parse_message(INTERNSHIP, settings.AI_MAX_BODY_CHARS)
    fake_ai.push({"bad": True}, extraction(skills=[], deadline=None, application_link=None))
    x = extract(m, real_user, KOLKATA)
    assert x.opportunity_name == "Frontend Internship 2027" and len(fake_ai.calls) == 2
    first = fake_ai.calls[0]
    assert (
        "Subject: Frontend Internship 2027" in first["prompt"] and "From: Careers Team <careers@acme.example>" in first["prompt"]
    )
    assert "SECRET-ATTACHMENT-TEXT" not in first["prompt"]
    body = first["prompt"].split("\n\n", 1)[1]
    assert len(body) <= 62  # trimmed body only
    assert "data, not instructions" in first["system"] and "frontend development" in first["system"]
    assert "previous answer was invalid" in fake_ai.calls[1]["prompt"]

    fake_ai.push({"bad": 1}, {"bad": 2})
    with pytest.raises(InvalidOutput):
        extract(m, real_user, KOLKATA)


# --- Rate limits -------------------------------------------------------------------------


def test_requests_are_spaced_to_the_per_minute_limit(fake_ai, no_wait, db):
    ai_client.set_provider(fake_ai, per_minute=3)
    fake_ai.push(*[{"ok": i} for i in range(4)])
    for _ in range(4):
        ai_client.generate_json("s", "p", {})
    assert no_wait and no_wait[0] == pytest.approx(60.05, abs=0.1)  # the 4th waited for the window


def test_429_waits_and_retries_instead_of_failing(fake_ai, no_wait, db):
    fake_ai.push(RateLimited("slow down", retry_after=17), RateLimited("again"), {"ok": True})
    out, model = ai_client.generate_json("s", "p", {})
    assert out == {"ok": True} and model == "fake-1"
    assert pytest.approx(17.05, abs=0.1) in no_wait and pytest.approx(20.05, abs=0.1) in no_wait
    assert AIUsage.objects.get(provider="fake").requests == 3


def test_persistent_rate_limits_become_transient_errors(fake_ai, db):
    fake_ai.push(*[RateLimited("x")] * 5)
    with pytest.raises(TransientAIError):
        ai_client.generate_json("s", "p", {})


def test_daily_budget_is_never_exceeded(fake_ai, db, settings):
    settings.AI_REQUESTS_PER_DAY = 2
    fake_ai.push({"a": 1}, {"b": 2}, {"c": 3})
    ai_client.generate_json("s", "p", {})
    ai_client.generate_json("s", "p", {})
    with pytest.raises(DailyLimitReached):
        ai_client.generate_json("s", "p", {})
    assert len(fake_ai.calls) == 2


# --- Providers (HTTP mocked) -----------------------------------------------------------


class FakeHTTP:
    def __init__(self, status, body, headers=None):
        self.status, self.body, self.headers = status, body, headers or {}
        self.sent = []

    def post(self, url, json=None, headers=None, timeout=None):
        self.sent.append({"url": url, "json": json, "headers": headers})
        r = requests.Response()
        r.status_code = self.status
        r._content = __import__("json").dumps(self.body).encode()
        r.headers.update(self.headers)
        return r


def test_gemini_provider_request_and_errors():
    ok = FakeHTTP(200, {"candidates": [{"content": {"parts": [{"text": '{"category": "Job"}'}]}, "finishReason": "STOP"}]})
    g = GeminiProvider("key-123", "gemini-3.8-flash", session=ok)
    assert g.generate_json("sys", "email", EXTRACTION_SCHEMA) == {"category": "Job"}
    sent = ok.sent[0]
    assert sent["url"].endswith("/models/gemini-3.8-flash:generateContent") and "key-123" not in sent["url"]
    assert sent["headers"]["x-goog-api-key"] == "key-123"
    cfg = sent["json"]["generationConfig"]
    assert cfg["responseMimeType"] == "application/json" and cfg["responseSchema"]["properties"]["deadline"]["nullable"] is True

    minute = {"error": {"code": 429, "details": [{"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "21s"}]}}
    with pytest.raises(RateLimited) as e:
        GeminiProvider("k", "m", session=FakeHTTP(429, minute)).generate_json("s", "p", {})
    assert e.value.retry_after == 21
    daily = {
        "error": {
            "details": [
                {"@type": "x.QuotaFailure", "violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}
            ]
        }
    }
    with pytest.raises(DailyLimitReached):
        GeminiProvider("k", "m", session=FakeHTTP(429, daily)).generate_json("s", "p", {})
    with pytest.raises(NotConfigured):
        GeminiProvider("k", "m", session=FakeHTTP(403, {"error": {"message": "bad key"}})).generate_json("s", "p", {})
    with pytest.raises(TransientAIError):
        GeminiProvider("k", "m", session=FakeHTTP(503, {})).generate_json("s", "p", {})
    with pytest.raises(InvalidOutput):
        GeminiProvider(
            "k", "m", session=FakeHTTP(200, {"candidates": [], "promptFeedback": {"blockReason": "SAFETY"}})
        ).generate_json("s", "p", {})
    with pytest.raises(NotConfigured):
        GeminiProvider("", "m")


def test_openai_provider_uses_the_same_interface():
    http = FakeHTTP(200, {"choices": [{"message": {"content": '{"category": "Job"}'}}]})
    p = OpenAIProvider("sk-test", "some-model", session=http)
    assert p.generate_json("sys", "email", EXTRACTION_SCHEMA) == {"category": "Job"}
    schema = http.sent[0]["json"]["response_format"]["json_schema"]
    assert schema["strict"] is True and schema["schema"]["additionalProperties"] is False
    assert schema["schema"]["properties"]["deadline"]["type"] == ["string", "null"]
    assert for_openai(EXTRACTION_SCHEMA)["properties"]["interview"]["properties"]["end"]["type"] == ["string", "null"]
    with pytest.raises(DailyLimitReached):
        OpenAIProvider("k", "m", session=FakeHTTP(429, {"error": {"code": "insufficient_quota"}})).generate_json("s", "p", {})


def test_provider_is_chosen_by_setting(settings):
    settings.AI_PROVIDER, settings.GEMINI_API_KEY = "gemini", "k"
    assert ai_client.build_provider().name == "gemini"
    settings.AI_PROVIDER, settings.OPENAI_API_KEY, settings.OPENAI_MODEL = "openai", "k", "m"
    assert ai_client.build_provider().name == "openai"
    settings.AI_PROVIDER = "other"
    with pytest.raises(NotConfigured):
        ai_client.build_provider()


# --- Sync end to end --------------------------------------------------------------------


def test_sync_finds_an_opportunity_and_skips_the_rest(real_user, gmail, fake_ai):
    gmail.messages = {
        m["id"]: m
        for m in [
            INTERNSHIP,
            message("p1", subject="40% off all courses", text="Big sale!", labels=["CATEGORY_PROMOTIONS"]),
            message("x1", subject="Lunch", text="Pizza?", sender="Sam <sam@friends.example>"),
        ]
    }
    fake_ai.push(extraction())
    api = make_client(real_user)
    r = api.post("/api/sync/")
    assert r.status_code == 202

    status = api.get("/api/sync/").json()
    assert status["phase"] == "completed" and status["queued"] == 0
    assert len(fake_ai.calls) == 1  # only the internship reached the AI
    opp = Opportunity.objects.get(user=real_user)
    assert (opp.title, opp.organization, opp.type) == ("Frontend Internship 2027", "Acme", "Internship")
    assert opp.application_link == "https://acme.example/careers/frontend-intern"
    assert opp.match_reasons["skills"] == "met" and opp.match_reasons["interests"] == "met"
    assert 0 < opp.match_score <= 100 and opp.priority in ("High", "Medium", "Low")
    assert Deadline.objects.get(opportunity=opp).due_date.isoformat() == "2026-10-20"
    assert Email.objects.filter(user=real_user).count() == 1  # skipped emails are never stored
    outcomes = dict(ProcessedMessage.objects.filter(user=real_user).values_list("gmail_message_id", "outcome"))
    assert outcomes == {"m1": "stored", "p1": "promotion", "x1": "no_opportunity_words"}
    g = GmailConnection.objects.get(user=real_user)
    assert g.history_id == "100"

    # The dashboard shows it.
    assert api.get("/api/insights/dashboard/").json()["stats"]["total"]["value"] == 1


def test_resync_is_idempotent_and_follow_ups_link(real_user, gmail, fake_ai):
    gmail.messages = {"m1": INTERNSHIP}
    fake_ai.push(extraction())
    sync.start_sync(real_user)
    # Next sync: history returns the same id again plus a follow-up in the same thread.
    follow = message(
        "m2",
        subject="Interview invitation: Frontend Internship 2027",
        text="We'd like to interview you on 7 October 2026 at 14:00 IST over video call.",
        thread="m1",
    )
    gmail.add(INTERNSHIP, follow)
    fake_ai.push(
        extraction(
            summary="Interview invitation.",
            deadline=None,
            skills=[],
            application_link=None,
            interview={"start": "2026-10-07T14:00:00+05:30", "end": None, "location": "video call"},
        )
    )
    sync.start_sync(real_user)
    assert Opportunity.objects.filter(user=real_user).count() == 1
    opp = Opportunity.objects.get(user=real_user)
    assert Email.objects.filter(opportunity=opp).count() == 2
    iv = Interview.objects.get(opportunity=opp)
    assert iv.start == datetime(2026, 10, 7, 8, 30, tzinfo=UTC) and iv.end is None
    assert len(fake_ai.calls) == 2  # m1 was not processed twice


def test_daily_limit_leaves_emails_queued_and_the_sync_completes(real_user, gmail, fake_ai, settings):
    settings.AI_REQUESTS_PER_DAY = 1
    gmail.messages = {
        "m1": INTERNSHIP,
        "m2": message("m2", subject="Hackathon registration open", text="Register for HackX by 30 October 2026"),
        "m3": message("m3", subject="Scholarship applications", text="Apply for the STEM scholarship"),
    }
    fake_ai.push(extraction())
    sync.start_sync(real_user)
    g = GmailConnection.objects.get(user=real_user)
    assert g.sync_phase == "completed" and g.sync_queued == 2 and g.status == "connected"
    assert ProcessedMessage.objects.filter(user=real_user, status="queued").count() == 2

    # Tomorrow (a new quota day) the next sync finishes the queue.
    AIUsage.objects.all().delete()
    settings.AI_REQUESTS_PER_DAY = 10
    fake_ai.push(
        extraction(category="Hackathon", opportunity_name="HackX", organization="HackX", deadline="2026-10-30",
                   skills=[], application_link=None, eligibility=None),
        extraction(category="Newsletter", is_opportunity=False, relevance=20),
    )  # fmt: skip
    sync.start_sync(real_user)
    g.refresh_from_db()
    assert g.sync_queued == 0
    assert set(Opportunity.objects.filter(user=real_user).values_list("title", flat=True)) == {
        "Frontend Internship 2027",
        "HackX",
    }
    assert ProcessedMessage.objects.get(gmail_message_id="m3").outcome == "not_relevant"


def test_rate_limit_storm_never_fails_the_sync(real_user, gmail, fake_ai):
    gmail.messages = {"m1": INTERNSHIP}
    fake_ai.push(*[RateLimited("x")] * 5)
    sync.start_sync(real_user)
    g = GmailConnection.objects.get(user=real_user)
    assert g.sync_phase == "completed" and g.sync_queued == 1
    pm = ProcessedMessage.objects.get(gmail_message_id="m1")
    assert pm.status == "queued" and pm.attempts == 1


def test_invalid_output_goes_to_needs_review(real_user, gmail, fake_ai):
    gmail.messages = {"m1": INTERNSHIP}
    fake_ai.push({"nope": 1}, {"nope": 2})
    sync.start_sync(real_user)
    pm = ProcessedMessage.objects.get(gmail_message_id="m1")
    assert (pm.status, pm.outcome) == ("needs_review", "invalid_output") and "Missing fields" in pm.last_error
    assert not Email.objects.filter(user=real_user).exists()


def test_preferences_shape_what_becomes_an_opportunity(real_user, gmail, fake_ai):
    p = real_user.preferences
    p.categories = ["Hackathon"]
    p.save()
    gmail.messages = {"m1": INTERNSHIP}
    fake_ai.push(extraction())
    sync.start_sync(real_user)
    assert not Opportunity.objects.filter(user=real_user).exists()
    assert ProcessedMessage.objects.get(gmail_message_id="m1").outcome == "category_off"
    assert Email.objects.filter(user=real_user).count() == 1  # the email is still listed in the inbox


def test_revoked_access_marks_needs_reconnect(real_user, monkeypatch, fake_ai):
    from mail.gmail import GmailAuthError

    def boom(cls, g):
        raise GmailAuthError("invalid_grant: Token has been expired or revoked.")

    monkeypatch.setattr(sync.GmailClient, "for_connection", classmethod(boom))
    sync.start_sync(real_user)
    g = GmailConnection.objects.get(user=real_user)
    assert (g.status, g.sync_phase) == ("needs_reconnect", "error")
    r = make_client(real_user).post("/api/sync/")
    assert r.status_code == 409 and r.json()["error"]["code"] == "gmail_access"


def test_tokens_are_encrypted_at_rest(real_user):
    g = GmailConnection.objects.get(user=real_user)
    assert "refresh-secret" not in g.refresh_token_enc and "ya29" not in g.access_token_enc
    assert g.refresh_token == "1//refresh-secret"


def test_stale_sync_can_restart(real_user, gmail, fake_ai, freeze):
    g = real_user.gmail
    g.sync_phase, g.sync_started_at = "analyzing", NOW - timedelta(hours=2)
    g.save()
    gmail.messages = {}
    sync.start_sync(real_user)
    g.refresh_from_db()
    assert g.sync_phase == "completed"


def test_overloaded_model_falls_back_to_the_lighter_flash_model(no_wait, db):
    main = FakeProvider([TransientAIError("Gemini 503: high demand", overloaded=True)])
    lite = FakeProvider([{"ok": "lite"}, {"ok": "lite again"}])
    lite.model = "gemini-3.5-flash-lite"
    ai_client.set_provider(main, fallback=lite)
    out, model = ai_client.generate_json("s", "p", {})
    assert out == {"ok": "lite"} and model == "gemini-3.5-flash-lite"
    assert no_wait == []  # retried immediately, no backoff
    # Within the next few minutes the fallback is used directly (no wasted request on the busy model).
    assert ai_client.generate_json("s", "p", {})[0] == {"ok": "lite again"} and len(main.calls) == 1
    assert AIUsage.objects.get(provider="fake").requests == 3  # every attempt counts against the budget


def test_gemini_503_is_reported_as_overloaded():
    busy = {"error": {"code": 503, "status": "UNAVAILABLE", "message": "This model is currently experiencing high demand."}}
    with pytest.raises(TransientAIError) as e:
        GeminiProvider("k", "m", session=FakeHTTP(503, busy)).generate_json("s", "p", {})
    assert e.value.overloaded is True
    with pytest.raises(TransientAIError) as e:
        GeminiProvider("k", "m", session=FakeHTTP(500, {})).generate_json("s", "p", {})
    assert e.value.overloaded is False


def test_a_sync_interrupted_by_a_restart_can_start_again(real_user, gmail, fake_ai):
    g = real_user.gmail
    g.sync_phase, g.sync_started_at = "analyzing", NOW - timedelta(minutes=2)  # its thread died with the old process
    g.save()
    gmail.messages = {"m1": INTERNSHIP}
    fake_ai.push(extraction())
    sync.start_sync(real_user)
    g.refresh_from_db()
    assert g.sync_phase == "completed" and Opportunity.objects.filter(user=real_user).count() == 1


def test_demo_connection_is_flagged_by_migration(db):
    from importlib import import_module

    from django.apps import apps

    user = User.objects.create_user("rasmitha@example.com", name="Demo")
    GmailConnection.objects.filter(user=user).update(is_demo=False)
    import_module("accounts.migrations.0003_mark_demo_connection").mark_demo(apps, None)
    assert GmailConnection.objects.get(user=user).is_demo is True


def test_status_poll_resumes_a_sync_interrupted_by_a_restart(real_user, gmail, fake_ai):
    """The UI disables the sync button while a sync shows as running, so the server must resume it."""
    g = real_user.gmail
    g.sync_phase, g.sync_started_at, g.sync_emails_in_batch = "analyzing", NOW - timedelta(minutes=3), 1
    g.save()
    ProcessedMessage.objects.create(user=real_user, gmail_message_id="m1")  # queued before the restart
    gmail.messages = {"m1": INTERNSHIP}
    fake_ai.push(extraction())
    status = make_client(real_user).get("/api/sync/").json()
    assert status["phase"] == "completed" and status["queued"] == 0
    assert Opportunity.objects.filter(user=real_user).count() == 1
    assert ProcessedMessage.objects.get(gmail_message_id="m1").outcome == "stored"


def test_follow_up_with_a_different_type_links_instead_of_duplicating(real_user, gmail, fake_ai):
    gmail.messages = {"m1": INTERNSHIP}
    fake_ai.push(extraction(category="Hackathon", opportunity_name="Amazon ML Challenge 2026", organization="Amazon",
                            skills=[], application_link=None))  # fmt: skip
    sync.start_sync(real_user)
    gmail.add(message("m9", subject="Amazon ML Challenge: round 2", text="Round 2 of the challenge opens soon. Register now."))
    fake_ai.push(extraction(category="Competition", opportunity_name="Amazon ML Challenge 2026", organization="Amazon",
                            skills=[], application_link=None, deadline=None))  # fmt: skip
    sync.start_sync(real_user)
    assert Opportunity.objects.filter(user=real_user).count() == 1
    assert ProcessedMessage.objects.get(gmail_message_id="m9").outcome == "linked"


def test_profile_changes_rescore_ai_found_opportunities_but_not_the_seed(real_user, gmail, fake_ai, user):
    real_user.interests, real_user.skills = [], []
    real_user.save()
    gmail.messages = {"m1": INTERNSHIP}
    fake_ai.push(extraction(relevance=60))
    sync.start_sync(real_user)
    before = Opportunity.objects.get(user=real_user).match_score
    r = make_client(real_user).patch("/api/auth/me/", {"interests": ["frontend development"], "skills": ["React"]}, format="json")
    assert r.status_code == 200
    after = Opportunity.objects.get(user=real_user)
    assert after.match_reasons["interests"] == "met" and after.match_score > before

    # The seeded demo keeps its designed scores (the brief's targets depend on them).
    seed_scores = sorted(Opportunity.objects.filter(user=user).values_list("match_score", flat=True))
    make_client(user).patch("/api/auth/me/", {"skills": ["Python"]}, format="json")
    assert sorted(Opportunity.objects.filter(user=user).values_list("match_score", flat=True)) == seed_scores


def test_server_start_resumes_interrupted_syncs(real_user, gmail, fake_ai):
    g = real_user.gmail
    g.sync_phase, g.sync_started_at = "analyzing", NOW - timedelta(minutes=1)
    g.save()
    ProcessedMessage.objects.create(user=real_user, gmail_message_id="m1")
    gmail.messages = {"m1": INTERNSHIP}
    fake_ai.push(extraction())
    assert sync.resume_all_interrupted() == 1
    g.refresh_from_db()
    assert g.sync_phase == "completed" and Opportunity.objects.filter(user=real_user).count() == 1
    assert sync.resume_all_interrupted() == 0  # nothing left to resume
