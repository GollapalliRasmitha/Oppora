"""
Privacy before the AI: personal details are removed from everything sent to
Gemini, the AI consent screen comes before any scan, and "Use without AI"
reads emails with rules only (no AI request at all).
"""

from datetime import UTC, datetime

import pytest

from ai.redact import redact, sender_for_ai
from mail import sync
from mail.content import parse_message
from mail.fees import _fee_from_text
from mail.models import ProcessedMessage
from mail.rules import find_deadline, rules_extract
from opportunities.models import Deadline, Opportunity

from .conftest import KOLKATA, make_client
from .gmail_fakes import message
from .test_pipeline import extraction

PERSONAL = message(
    "p1",
    subject="Rasmitha, your Frontend Internship application — verify to continue",
    sender="Priya from Acme <priya.k@acme.example>",
    text=(
        "Hi Rasmitha Gollapalli,\n"
        "Thanks for applying to the Frontend Internship at Acme. Apply by 20 October 2026.\n"
        "Your OTP is 482913. Verification code: 7Q2K9A. 551204 is your login code.\n"
        "Questions? Call +91 98765 43210 or (080) 4123-4567, or write to someone@example.com or hr@acme.example.\n"
        "Finish here: https://acme.example/verify/eyJhbGciOiJIUzI1NiJ9abcdef1234567890xyz?token=s3cr3tT0k3nValue&ref=email\n"
        "Application form: https://docs.google.com/forms/d/e/1FAIpQLSdXyZ1234567890abcdefghijk/viewform\n"
        "Track: https://acme.example/apply?jobId=FE-2027&email=someone%40example.com&utm_source=mail\n"
        "Registration fee: Rs. 1,499/- payable by 15/10/2026. Stipend ₹20,000 per month for 12 weeks in 2027."
    ),
    sent=datetime(2026, 10, 1, 10, 0, tzinfo=UTC),
)
SECRETS = [
    "priya.k@acme.example",
    "someone@example.com",
    "hr@acme.example",
    "someone%40example.com",
    "98765 43210",
    "4123-4567",
    "482913",
    "7Q2K9A",
    "551204",
    "s3cr3tT0k3nValue",
    "eyJhbGciOiJIUzI1NiJ9abcdef1234567890xyz",
    "Rasmitha",
    "Gollapalli",
]


# --- Redaction rules ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "secret"),
    [
        ("Write to jane.doe+jobs@example.co.in today", "jane.doe+jobs@example.co.in"),
        ("Call +91 98765 43210", "98765 43210"),
        ("Call 9876543210", "9876543210"),
        ("Phone: (080) 4123-4567", "4123-4567"),
        ("US office +1 (415) 555-0132", "555-0132"),
        ("Your OTP is 482913", "482913"),
        ("Use verification code: 7Q2K9A to sign in", "7Q2K9A"),
        ("551204 is your login code", "551204"),
        ("PIN 4821", "4821"),
        ("Reset: https://x.example/reset/AbCdEf1234567890GhIjKl", "AbCdEf1234567890GhIjKl"),
        ("Open https://x.example/a?token=abc123def&id=7", "abc123def"),
        ("Magic link https://x.example/login?code=9f8e7d6c5b4a", "9f8e7d6c5b4a"),
    ],
)
def test_personal_details_are_removed(text, secret):
    assert secret not in redact(text).text


def test_the_users_name_is_removed_whole_words_only():
    out = redact("Hi Rasmitha Gollapalli! Dear rasmitha, see Gollapalli's form.", "Rasmitha Gollapalli").text
    assert "Rasmitha" not in out and "rasmitha" not in out and "Gollapalli" not in out
    assert out.startswith("Hi [name]!") and "[name]'s form" in out
    assert redact("Rasmithafoo stays", "Rasmitha").text == "Rasmithafoo stays"  # not part of another word


@pytest.mark.parametrize(
    "keep",
    [
        "Apply by 20 October 2026.",
        "Deadline: 2026-10-20 at 17:00",
        "Payable by 15/10/2026",
        "Registration fee: Rs. 1,499/-",
        "Stipend ₹20,000 per month for 12 weeks in 2027",
        "Batch of 2027, CGPA 7.5+",
        "Form: https://docs.google.com/forms/d/e/1FAIpQLSdXyZ1234567890abcdefghijk/viewform",
        "https://careers.acme.example/jobs/frontend-intern-2027?location=bengaluru",
        "Use the code of conduct",
        "Team of 2-4 members, prizes worth $5,000",
    ],
)
def test_what_the_ai_needs_is_kept(keep):
    assert redact(keep, "Rasmitha").text == keep


def test_sender_goes_without_its_address():
    assert sender_for_ai("Priya from Acme", "priya.k@acme.example") == "Priya from Acme (acme.example)"
    assert sender_for_ai("Rasmitha G", "me@gmail.example", "Rasmitha G") == "[name] (gmail.example)"


# --- Nothing personal reaches the AI ----------------------------------------------


def test_an_ai_request_contains_none_of_the_personal_details(real_user, fake_ai, settings):
    real_user.name = "Rasmitha Gollapalli"
    real_user.save()
    settings.AI_MAX_BODY_CHARS = 4000
    m = parse_message(PERSONAL, settings.AI_MAX_BODY_CHARS)
    fake_ai.push(
        extraction(
            opportunity_name="Frontend Internship",
            application_link="https://acme.example/apply?jobId=FE-2027&email=[token]&utm_source=mail",
            fee=None,
        )
    )
    from ai.extract import extract

    x = extract(m, real_user, KOLKATA)
    sent = fake_ai.calls[0]["system"] + fake_ai.calls[0]["prompt"]
    for secret in SECRETS:
        assert secret not in sent, secret
    assert "[email]" in sent and "[phone]" in sent and "[code]" in sent and "[token]" in sent and "[name]" in sent
    # What the AI needs is still there.
    assert "20 October 2026" in sent and "Rs. 1,499/-" in sent and "docs.google.com/forms/d/e/1FAIpQLSdXyZ" in sent
    # The cleaned link the AI returned is stored as the email's own link (it stays on our server).
    assert x.application_link == "https://acme.example/apply?jobId=FE-2027&email=someone%40example.com&utm_source=mail"


def test_fee_checks_send_only_cleaned_sentences(fake_ai, db):
    fake_ai.push({"fee": {"amount": 1499, "currency": "INR", "quote": "Registration fee: Rs. 1,499/- payable by 15/10/2026."}})
    text = "Hi Rasmitha.\nRegistration fee: Rs. 1,499/- payable by 15/10/2026. Pay via 9876543210@upi or call 9876543210."
    fee = _fee_from_text(text, "Rasmitha")
    assert fee and fee["amount"] == 1499
    prompt = fake_ai.calls[0]["prompt"]
    assert "9876543210" not in prompt and "Rasmitha" not in prompt


# --- Consent screen ----------------------------------------------------------------


def test_no_scan_and_no_ai_before_the_consent_answer(real_user, gmail, fake_ai):
    prefs = real_user.preferences
    prefs.ai_mode = "ask"
    prefs.save()
    gmail.messages = {"p1": PERSONAL}
    api = make_client(real_user)
    r = api.post("/api/sync/")
    assert r.status_code == 409 and r.json()["error"]["code"] == "ai_choice_required"
    assert api.get("/api/auth/me/").json()["aiMode"] == "ask"
    assert not sync.run_scheduled(real_user.pk, 60)  # the scheduler skips it too
    assert not fake_ai.calls and not Opportunity.objects.filter(user=real_user).exists()


def test_the_choice_is_saved_and_can_be_changed(real_user):
    api = make_client(real_user)
    r = api.patch("/api/preferences/", {"ai": {"mode": "rules"}}, format="json")
    assert r.status_code == 200 and r.json()["ai"]["mode"] == "rules"
    real_user.preferences.refresh_from_db()
    assert real_user.preferences.ai_mode_set_at is not None
    assert api.patch("/api/preferences/", {"ai": {"mode": "ask"}}, format="json").status_code == 400  # can't un-answer
    assert api.patch("/api/preferences/", {"ai": {"mode": "ai"}}, format="json").json()["ai"]["mode"] == "ai"


# --- "Use without AI": rules only ---------------------------------------------------


def test_without_ai_emails_are_read_by_rules_and_nothing_is_sent(real_user, gmail, fake_ai):
    prefs = real_user.preferences
    prefs.ai_mode = "rules"
    prefs.save()
    gmail.messages = {"p1": PERSONAL}
    assert make_client(real_user).post("/api/sync/").status_code == 202
    assert not fake_ai.calls  # no AI request at all
    opp = Opportunity.objects.get(user=real_user)
    assert opp.type == "Internship" and opp.organization == "Priya from Acme"
    assert Deadline.objects.get(opportunity=opp).due_date.isoformat() == "2026-10-20"
    assert opp.application_link.startswith("https://docs.google.com/forms/")  # the link next to "Application form"
    assert opp.fee_amount == 1499 and "Rs. 1,499/-" in opp.fee_text
    assert opp.location is None  # never guessed
    assert ProcessedMessage.objects.get(user=real_user).outcome == "stored"
    assert opp.emails.first().classification.model_name == "rules"


def test_switching_mid_queue_applies_to_the_next_email(real_user, gmail, fake_ai):
    gmail.messages = {"p1": PERSONAL}
    prefs = real_user.preferences
    prefs.ai_mode = "rules"
    prefs.save()
    sync.run_sync(real_user.pk)
    assert not fake_ai.calls


def test_rule_deadlines_need_a_deadline_phrase():
    sent = datetime(2026, 10, 1).date()
    assert find_deadline("Apply by 20 October 2026", sent).isoformat() == "2026-10-20"
    assert find_deadline("Registrations close on Oct 5", sent).isoformat() == "2026-10-05"
    assert find_deadline("Last date: 2026-11-30", sent).isoformat() == "2026-11-30"
    assert find_deadline("Submit before 15/10/2026", sent).isoformat() == "2026-10-15"
    assert find_deadline("The event was on 20 October 2026", sent) is None  # a date, but not a deadline
    assert find_deadline("Closes 15 January", sent).isoformat() == "2027-01-15"  # no year: the next one


def test_rules_dont_invent_an_opportunity(real_user, settings):
    m = parse_message(
        message("n1", subject="Your weekly digest", text="Here are this week's stories."), settings.AI_MAX_BODY_CHARS
    )
    x = rules_extract(m, real_user, KOLKATA)
    assert not x.is_opportunity and x.category == "Other" and x.deadline is None and x.application_link is None
