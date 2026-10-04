"""
Copies one account's data from this database to another one (local → Neon),
so production doesn't spend the AI budget re-scanning the same mailbox.

    $env:TARGET_DATABASE_URL = "<Neon connection string>"   # this terminal only
    python manage.py copy_account --email you@gmail.com            # dry run: counts only
    python manage.py copy_account --email you@gmail.com --yes      # copy

Copied: profile, preferences, opportunities (+ deadlines, applications,
interviews), emails (sender, subject, date, snippet; bodies are never stored),
their AI classification, saved items, hidden senders, notification read state,
and the processed-message log (so already-analysed emails are never sent to the
AI again; queued ones continue in production).

Never copied: Google tokens (encrypted with this machine's key: reconnect
Gmail once in production), the AI usage counters, sessions.
"""

from contextlib import contextmanager

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction
from django.db.migrations.executor import MigrationExecutor

from accounts.models import GmailConnection, User, UserPreference
from mail.models import Email, EmailClassification, ProcessedMessage
from notifications.models import Notification
from opportunities.models import Application, Deadline, HiddenSender, Interview, Opportunity, SavedItem

TARGET = "target"

# Parents before children (foreign keys), with how to find the user's rows.
MODELS = [
    (Opportunity, "user"),
    (Email, "user"),
    (EmailClassification, "email__user"),
    (Deadline, "user"),
    (Application, "user"),
    (SavedItem, "user"),
    (Interview, "user"),
    (ProcessedMessage, "user"),
    (HiddenSender, "user"),
    (Notification, "user"),
]
PROFILE_FIELDS = ["name", "plan", "interests", "skills", "experience_level", "timezone"]
PREFERENCE_FIELDS = [f.name for f in UserPreference._meta.concrete_fields if f.name != "user"]  # every setting, theme included
# Gmail connection: what's safe without the tokens. It stays "disconnected" until you reconnect.
GMAIL_FIELDS = ["email", "google_sub", "scopes", "initial_sync_days", "history_id", "last_synced_at", "sync_queued"]


@contextmanager
def keep_timestamps():
    """Copies keep their created_at/updated_at (the queue and lists are ordered by them)."""
    changed = []
    for model, _ in MODELS:
        for f in model._meta.concrete_fields:
            if getattr(f, "auto_now", False) or getattr(f, "auto_now_add", False):
                changed.append((f, f.auto_now, f.auto_now_add))
                f.auto_now = f.auto_now_add = False
    try:
        yield
    finally:
        for f, now, add in changed:
            f.auto_now, f.auto_now_add = now, add


class Command(BaseCommand):
    help = "Copies one account's data to TARGET_DATABASE_URL (dry run unless --yes). Google tokens are never copied."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="The account to copy (your Google address).")
        parser.add_argument("--yes", action="store_true", help="Really copy (without it: a dry run with counts).")
        parser.add_argument("--replace", action="store_true", help="Delete the account's existing data in the target first.")

    def handle(self, *args, email, yes, replace, **opts):
        if TARGET not in settings.DATABASES:
            raise CommandError("Set TARGET_DATABASE_URL (the Neon connection string) in this terminal first.")
        if settings.DATABASES[TARGET]["HOST"] == settings.DATABASES["default"]["HOST"] and (
            settings.DATABASES[TARGET]["NAME"] == settings.DATABASES["default"]["NAME"]
        ):
            raise CommandError("The target is the same database as the source.")
        email = email.strip().lower()
        if email == settings.DEMO_USER_EMAIL:
            raise CommandError("The demo account is loaded in production by itself; copy your own account.")
        source = User.objects.filter(email=email).first()
        if not source:
            raise CommandError(f"No account {email} in the local database.")

        executor = MigrationExecutor(connections[TARGET])
        if executor.migration_plan(executor.loader.graph.leaf_nodes()):
            raise CommandError("The target database isn't fully migrated. Deploy the backend first (it migrates on start).")

        counts = {m.__name__: m.objects.filter(**{lookup: source}).count() for m, lookup in MODELS}
        target_user = User.objects.using(TARGET).filter(email=email).first()
        existing = (
            sum(m.objects.using(TARGET).filter(**{lookup: target_user}).count() for m, lookup in MODELS) if target_user else 0
        )

        self.stdout.write(f"Account: {email}")
        for name, n in counts.items():
            self.stdout.write(f"  {name:<20} {n}")
        self.stdout.write("  Google tokens        not copied (reconnect Gmail once in production)")
        if existing and not replace:
            raise CommandError(
                f"The target already has {existing} rows for this account. Re-run with --replace to overwrite them."
            )
        if not yes:
            self.stdout.write(self.style.WARNING("Dry run: nothing was copied. Add --yes to copy."))
            return

        with transaction.atomic(using=TARGET), keep_timestamps():
            if target_user is None:
                target_user = User.objects.db_manager(TARGET).create_user(email, name=source.name)
            for f in PROFILE_FIELDS:
                setattr(target_user, f, getattr(source, f))
            target_user.save(using=TARGET)
            if replace:
                for model, lookup in reversed(MODELS):
                    model.objects.using(TARGET).filter(**{lookup: target_user}).delete()

            prefs = UserPreference.objects.get(user=source)
            UserPreference.objects.using(TARGET).update_or_create(
                user=target_user, defaults={f: getattr(prefs, f) for f in PREFERENCE_FIELDS}
            )
            gmail = GmailConnection.objects.get(user=source)
            GmailConnection.objects.using(TARGET).update_or_create(
                user=target_user,
                defaults={
                    **{f: getattr(gmail, f) for f in GMAIL_FIELDS},
                    "status": GmailConnection.Status.DISCONNECTED,
                    "is_demo": False,
                    "refresh_token_enc": "",
                    "access_token_enc": "",
                    "token_expiry": None,
                    "connected_at": None,
                    "sync_phase": GmailConnection.Phase.COMPLETED if gmail.last_synced_at else GmailConnection.Phase.IDLE,
                    "sync_started_at": None,
                    "sync_emails_in_batch": 0,
                },
            )

            for model, lookup in MODELS:
                rows = list(model.objects.filter(**{lookup: source}).order_by("pk"))
                for row in rows:
                    if hasattr(row, "user_id"):
                        row.user_id = target_user.pk
                model.objects.using(TARGET).bulk_create(rows, batch_size=200)

        self.stdout.write(
            self.style.SUCCESS(
                "Copied. In production: sign in with Google, then Settings → Gmail → Reconnect. "
                "Already-analysed emails won't be sent to the AI again."
            )
        )
