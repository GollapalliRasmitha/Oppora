"""Fee detection (grounded in the email), the fee re-check, and "Hide all from this sender"."""

from decimal import Decimal

import pytest

from ai.fees import fee_sentences, validate_fee
from mail import sync
from mail.fees import recheck_fees
from mail.models import Email, ProcessedMessage
from opportunities.models import HiddenSender, Opportunity

from .conftest import make_client
from .gmail_fakes import message
from .test_pipeline import INTERNSHIP, extraction

FEE_EMAIL = message(
    "f1",
    subject="Python Development Internship Program",
    sender="Infotact Solutions <hr@infotact.example>",
    text=(
        "Congratulations! You are selected for our Python internship.\n"
        "To confirm your seat, pay a one-time registration fee of Rs. 500/- before 10 October 2026.\n"
        "Apply: https://infotact.example/apply"
    ),
)
QUOTE = "To confirm your seat, pay a one-time registration fee of Rs. 500/- before 10 October 2026."
FEE_TEXT = "Python Development Internship Program\n" + QUOTE


def route(**by_word):
    """A FakeProvider reply chosen by a word in the prompt (the queue's order isn't fixed)."""

    def reply(prompt):
        for word, answer in by_word.items():
            if word in prompt:
                return answer
        raise AssertionError(f"unexpected prompt: {prompt[:80]}")

    return reply


@pytest.mark.parametrize(
    ("raw", "text", "expected"),
    [
        ({"amount": 500, "currency": "INR", "quote": QUOTE}, FEE_TEXT, {"amount": Decimal(500), "currency": "INR"}),
        ({"amount": 1499, "currency": None, "quote": "A training fee of ₹1,499 is payable."}, "x A training fee of ₹1,499 is payable. y", {"amount": Decimal(1499), "currency": "INR"}),
        # Amount not written in the quote → amount dropped, fee still stated.
        ({"amount": 999, "currency": "INR", "quote": QUOTE}, FEE_TEXT, {"amount": None, "currency": "INR"}),
        # Not the email's words (hallucinated) → nothing.
        ({"amount": 500, "currency": "INR", "quote": "Pay ₹500 to register."}, FEE_TEXT, None),
        # Negations → nothing.
        ({"amount": None, "currency": None, "quote": "There is no registration fee for this program."}, "There is no registration fee for this program.", None),
        ({"amount": None, "currency": None, "quote": "The workshop is completely free of cost."}, "The workshop is completely free of cost.", None),
        # Money paid TO the reader, or no money at all → nothing.
        ({"amount": 10000, "currency": "INR", "quote": "You will receive a stipend of ₹10,000 per month."}, "You will receive a stipend of ₹10,000 per month.", None),
        ({"amount": None, "currency": None, "quote": "Please pay attention to the deadline."}, "Please pay attention to the deadline.", None),
        (None, FEE_TEXT, None),
    ],
)  # fmt: skip
def test_fee_is_only_kept_when_the_email_states_it(raw, text, expected):
    fee = validate_fee(raw, text)
    if expected is None:
        assert fee is None
    else:
        assert fee["amount"] == expected["amount"] and fee["currency"] == expected["currency"] and fee["text"]


def test_rule_prescan_finds_paying_sentences_only():
    assert fee_sentences(FEE_TEXT) == [QUOTE]
    assert fee_sentences("Stipend: ₹10,000. No fees at all for applicants.") == []


def test_pipeline_stores_the_fee_warns_and_ranks_lower(real_user, gmail, fake_ai):
    gmail.messages = {"f1": FEE_EMAIL, "m1": INTERNSHIP}
    base = dict(skills=[], application_link=None, eligibility=None, deadline=None, relevance=80)
    replies = route(
        Acme=extraction(opportunity_name="Frontend Internship 2027", **base),
        Infotact=extraction(opportunity_name="Python Development Internship", organization="Infotact Solutions",
                            fee={"amount": 500, "currency": "INR", "quote": QUOTE}, **base),
    )  # fmt: skip
    fake_ai.push(replies, replies)
    sync.start_sync(real_user)
    paid = Opportunity.objects.get(user=real_user, organization="Infotact Solutions")
    free = Opportunity.objects.get(user=real_user, organization="Acme")
    assert (paid.fee_amount, paid.fee_currency, paid.fee_text) == (Decimal(500), "INR", QUOTE)
    assert paid.priority == "Low" and paid.match_score <= free.match_score - 25
    api = make_client(real_user)
    o = api.get(f"/api/opportunities/{paid.id}/").json()
    assert o["fee"] == {"amount": 500.0, "currency": "INR", "text": QUOTE}
    assert api.get(f"/api/opportunities/{free.id}/").json()["fee"] is None
    assert [x["organization"] for x in api.get("/api/opportunities/").json()["results"]][-1] == "Infotact Solutions"


def test_fee_is_never_flagged_without_the_emails_words(real_user, gmail, fake_ai):
    # The AI claims a fee for a company, but the email never mentions paying.
    gmail.messages = {"m1": INTERNSHIP}
    fake_ai.push(extraction(fee={"amount": 500, "currency": "INR", "quote": "Infotact always charges ₹500."}))
    sync.start_sync(real_user)
    assert Opportunity.objects.get(user=real_user).fee_text == ""


def test_recheck_rereads_gmail_and_uses_ai_only_when_paying_is_mentioned(real_user, gmail, fake_ai):
    gmail.messages = {"f1": FEE_EMAIL, "m1": INTERNSHIP}
    replies = route(
        Acme=extraction(opportunity_name="Frontend Internship 2027", skills=[], application_link=None),
        Infotact=extraction(opportunity_name="Python Development Internship", organization="Infotact Solutions",
                            skills=[], application_link=None),
    )  # fmt: skip
    fake_ai.push(replies, replies)
    sync.start_sync(real_user)  # an older sync that missed the fee
    Opportunity.objects.filter(user=real_user).update(fee_checked_at=None, fee_text="", fee_amount=None)
    calls_before = len(fake_ai.calls)
    fake_ai.push({"fee": {"amount": 500, "currency": "INR", "quote": QUOTE}})
    result = recheck_fees(real_user, gmail)
    assert result == {"checked": 2, "flagged": 1, "waiting": 0}
    assert len(fake_ai.calls) == calls_before + 1  # the Acme email has no paying sentence: no AI request
    assert QUOTE in fake_ai.calls[-1]["prompt"] and "Python internship" not in fake_ai.calls[-1]["prompt"]  # only the sentence
    assert Opportunity.objects.get(organization="Infotact Solutions").fee_amount == Decimal(500)
    assert recheck_fees(real_user, gmail) == {"checked": 0, "flagged": 0, "waiting": 0}  # each is checked once


def test_recheck_finishes_what_it_can_when_the_ai_budget_is_spent(real_user, gmail, fake_ai, settings):
    from ai.models import AIUsage

    replies = route(
        Acme=extraction(opportunity_name="Frontend Internship 2027", skills=[], application_link=None),
        Infotact=extraction(opportunity_name="Python Development Internship", organization="Infotact Solutions",
                            skills=[], application_link=None),
    )  # fmt: skip
    gmail.messages = {"f1": FEE_EMAIL, "m1": INTERNSHIP}
    fake_ai.push(replies, replies)
    sync.start_sync(real_user)
    Opportunity.objects.filter(user=real_user).update(fee_checked_at=None)
    settings.AI_REQUESTS_PER_DAY = AIUsage.objects.get(provider="fake").requests  # today's budget is spent
    # Acme's email never mentions paying: finished for free. Infotact's needs the AI: waits for the reset.
    assert recheck_fees(real_user, gmail) == {"checked": 1, "flagged": 0, "waiting": 1}
    assert Opportunity.objects.get(organization="Infotact Solutions").fee_checked_at is None


# --- Hide all from this sender ---------------------------------------------------------


def test_hide_all_from_sender_and_show_again(api, ids):
    url = "/api/hidden-senders/"
    r = api.post(url, {"opportunityId": ids["opp_microsoft_explore"]}, format="json")
    assert r.status_code == 201
    rule = r.json()
    assert rule["senderEmail"] == "recruiting@microsoft.example"
    assert ids["opp_microsoft_explore"] in rule["hiddenOpportunityIds"]
    assert api.get(f"/api/opportunities/{ids['opp_microsoft_explore']}/").json()["dismissed"] is True
    assert ids["opp_microsoft_explore"] not in {o["id"] for o in api.get("/api/opportunities/").json()["results"]}
    assert len(api.get(url).json()) == 1

    restored = api.delete(f"{url}{rule['id']}/").json()["restoredOpportunityIds"]
    assert restored == [ids["opp_microsoft_explore"]]
    assert api.get(f"/api/opportunities/{ids['opp_microsoft_explore']}/").json()["dismissed"] is False
    assert api.get(url).json() == []


def test_show_again_does_not_restore_separately_dismissed(api, ids):
    api.patch(f"/api/opportunities/{ids['opp_amazon_frontend']}/", {"dismissed": True}, format="json")
    rule = api.post("/api/hidden-senders/", {"opportunityId": ids["opp_tcs_codevita_2026"]}, format="json").json()
    api.delete(f"/api/hidden-senders/{rule['id']}/")
    assert api.get(f"/api/opportunities/{ids['opp_amazon_frontend']}/").json()["dismissed"] is True


def test_hidden_senders_future_emails_are_skipped(real_user, gmail, fake_ai):
    gmail.messages = {"f1": FEE_EMAIL}
    fake_ai.push(extraction(opportunity_name="Python Development Internship", organization="Infotact Solutions",
                            skills=[], application_link=None))  # fmt: skip
    sync.start_sync(real_user)
    opp = Opportunity.objects.get(user=real_user)
    make_client(real_user).post("/api/hidden-senders/", {"opportunityId": str(opp.id)}, format="json")
    assert HiddenSender.objects.get(user=real_user).sender_email == "hr@infotact.example"
    gmail.add(
        message(
            "f2",
            subject="Internship batch 2",
            sender="Infotact Solutions <hr@infotact.example>",
            text="Apply for internship batch 2",
        )
    )
    calls = len(fake_ai.calls)
    sync.start_sync(real_user)
    assert ProcessedMessage.objects.get(gmail_message_id="f2").outcome == "hidden_sender"
    assert len(fake_ai.calls) == calls and Email.objects.filter(user=real_user).count() == 1


def test_cannot_hide_another_users_sender(api, real_user):
    other = Opportunity.objects.create(user=real_user, title="X", organization="Y", type="Job", discovered_at="2026-10-01T00:00Z")
    r = api.post("/api/hidden-senders/", {"opportunityId": str(other.id)}, format="json")
    assert r.status_code == 400
    assert not Opportunity.objects.get(pk=other.pk).dismissed
