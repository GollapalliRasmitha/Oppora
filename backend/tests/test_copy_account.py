"""manage.py copy_account: one account's data into another database (local → Neon), never the Google tokens."""

from datetime import UTC, datetime

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from accounts.models import GmailConnection, User
from core.seed import load_seed
from mail.models import Email, EmailClassification, ProcessedMessage
from opportunities.models import Application, Deadline, Opportunity, SavedItem

from .conftest import DEMO_NOW, exported_for

pytestmark = pytest.mark.django_db(databases=["default", "target"])
EMAIL = "me@gmail.example"


@pytest.fixture
def account(freeze):
    freeze(DEMO_NOW)
    user, _ = load_seed(exported_for(DEMO_NOW.date()), EMAIL)  # a full dataset for a real (non-demo) account
    g = user.gmail
    g.is_demo, g.status, g.history_id = False, GmailConnection.Status.CONNECTED, "4242"
    g.set_tokens(refresh_token="1//secret-refresh", access_token="ya29.secret", expiry=datetime(2030, 1, 1, tzinfo=UTC))
    g.save()
    ProcessedMessage.objects.create(user=user, gmail_message_id="still-queued")  # waiting for the AI
    user.preferences.theme = "light"
    user.preferences.save()
    return user


def test_dry_run_copies_nothing(account, capsys):
    call_command("copy_account", email=EMAIL)
    assert "Dry run" in capsys.readouterr().out
    assert not User.objects.using("target").filter(email=EMAIL).exists()


def test_copies_everything_but_the_tokens(account):
    call_command("copy_account", email=EMAIL, yes=True)
    t = User.objects.using("target").get(email=EMAIL)
    assert (t.name, t.skills, t.experience_level) == (account.name, account.skills, account.experience_level)
    for model, lookup in [(Opportunity, "user"), (Email, "user"), (Deadline, "user"), (Application, "user"), (SavedItem, "user")]:
        assert (
            model.objects.using("target").filter(**{lookup: t}).count() == model.objects.filter(**{lookup: account}).count() > 0
        )
    assert EmailClassification.objects.using("target").filter(email__user=t).count() == Email.objects.filter(user=account).count()

    # Same ids and timestamps (lists and the queue are ordered by them).
    src = Opportunity.objects.filter(user=account).order_by("created_at")
    dst = Opportunity.objects.using("target").filter(user=t).order_by("created_at")
    assert [(o.id, o.created_at, o.match_score) for o in src] == [(o.id, o.created_at, o.match_score) for o in dst]

    # The processed-message log comes along: analysed emails won't go to the AI again; queued ones continue.
    assert ProcessedMessage.objects.using("target").get(user=t, gmail_message_id="still-queued").status == "queued"

    g = GmailConnection.objects.using("target").get(user=t)
    assert g.refresh_token_enc == "" and g.access_token_enc == "" and g.status == "disconnected"
    assert g.history_id == "4242"
    assert t.preferences.__class__.objects.using("target").get(user=t).theme == "light"


def test_refuses_to_overwrite_unless_asked(account):
    call_command("copy_account", email=EMAIL, yes=True)
    with pytest.raises(CommandError, match="--replace"):
        call_command("copy_account", email=EMAIL, yes=True)
    call_command("copy_account", email=EMAIL, yes=True, replace=True)
    t = User.objects.using("target").get(email=EMAIL)
    assert Opportunity.objects.using("target").filter(user=t).count() == Opportunity.objects.filter(user=account).count()


def test_refuses_the_demo_and_unknown_accounts(account):
    with pytest.raises(CommandError, match="demo"):
        call_command("copy_account", email="alex@example.com", yes=True)
    with pytest.raises(CommandError, match="No account"):
        call_command("copy_account", email="nobody@example.com", yes=True)
