"""
Read-only health report of every account's Gmail sync, for diagnosing
production without opening anyone's emails.

    python manage.py sync_report                     # this machine's database
    $env:TARGET_DATABASE_URL = "<Neon string>"       # production (this terminal only)
    python manage.py sync_report --database target

Prints counts, outcomes and grouped error *types* only: email addresses are
masked, and no subject, sender, snippet or email text is ever shown.
"""

import re
from collections import Counter
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count

from accounts.models import GmailConnection, UserPreference
from ai.client import quota_day
from ai.models import AIUsage, AIUserUsage
from mail.models import EmailClassification, ProcessedMessage
from opportunities.models import Opportunity


def mask(email: str) -> str:
    name, _, domain = (email or "?").partition("@")
    return f"{name[:2]}…@{domain}" if domain else "?"


def error_kind(text: str) -> str:
    """Groups errors by type: ids, numbers and quoted values are blanked so nothing identifying is shown."""
    t = text.splitlines()[0] if text else ""
    t = re.sub(r"'[^']*'|\"[^\"]*\"", "'…'", t)
    t = re.sub(r"\b[0-9a-f]{12,}\b|\d{4,}", "#", t)
    return t[:90] or "(no message)"


class Command(BaseCommand):
    help = "Read-only report of each account's sync (counts and error types only, no email content)."

    def add_arguments(self, parser):
        parser.add_argument("--database", default="default", help='"target" = the database in TARGET_DATABASE_URL.')

    def handle(self, *args, database, **opts):
        from django.conf import settings

        if database not in settings.DATABASES:
            raise CommandError(f'No database "{database}". Set TARGET_DATABASE_URL first to use --database target.')
        db = database
        out = self.stdout.write
        today = quota_day()

        out(f"AI usage (all accounts, quota days in Pacific time; today = {today}):")
        for row in AIUsage.objects.using(db).filter(day__gte=today - timedelta(days=3)).order_by("-day", "provider"):
            out(f"  {row.day}  {row.provider:<8} {row.requests} requests")

        conns = GmailConnection.objects.using(db).filter(is_demo=False).select_related("user").order_by("connected_at")
        connected = sum(1 for g in conns if g.status == GmailConnection.Status.CONNECTED)
        out(f"\nAccounts: {conns.count()} (connected: {connected})")
        for i, g in enumerate(conns, 1):
            u = g.user
            prefs = UserPreference.objects.using(db).filter(user=u).first()
            pm = ProcessedMessage.objects.using(db).filter(user=u)
            by_status = dict(pm.values_list("status").annotate(n=Count("id")))
            outcomes = dict(pm.values_list("outcome").annotate(n=Count("id")))
            errors = Counter(error_kind(e) for e in pm.exclude(last_error="").values_list("last_error", flat=True))
            models = dict(
                EmailClassification.objects.using(db).filter(email__user=u).values_list("model_name").annotate(n=Count("pk"))
            )
            mine = AIUserUsage.objects.using(db).filter(user=u, day=today).values_list("provider", "requests")

            out(f"\n#{i} {mask(u.email)}")
            out(
                f"  Gmail: {g.status} · first-scan window {g.initial_sync_days} days · "
                f"history id {'set' if g.history_id else 'not set'} · AI mode {getattr(prefs, 'ai_mode', '?')}"
            )
            out(
                f"  Last sync: phase {g.sync_phase} · started {g.sync_started_at} · finished {g.last_synced_at} · "
                f"queued {g.sync_queued} · wait reason {getattr(g, 'sync_wait_reason', '') or '-'}"
            )
            if getattr(g, "sync_wait_detail", ""):
                out(f"  Wait detail: {error_kind(g.sync_wait_detail)}")
            out(f"  Fetched (in the log): {sum(by_status.values())}  by status: {by_status or '{}'}")
            out(f"  Outcomes: {dict(sorted(outcomes.items(), key=lambda kv: -kv[1])) or '{}'}")
            out(f"  Analysed by: {models or '{}'}   Opportunities: {Opportunity.objects.using(db).filter(user=u).count()}")
            out(f"  AI requests today (this account): {dict(mine) or 0}")
            for kind, n in errors.most_common(6):
                out(f"  error ×{n}: {kind}")
