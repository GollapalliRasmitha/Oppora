from datetime import date

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core import demo
from core.seed import SeedError, export_seed, load_seed


class Command(BaseCommand):
    help = (
        "Loads the demo seed (frontend/lib/mock/seed.ts) for one user, replacing their data. "
        "Dates are relative to today, so re-run it to refresh the demo on another day."
    )

    def add_arguments(self, parser):
        parser.add_argument("--email", default=settings.DEMO_USER_EMAIL, help="Account to load the seed into.")
        parser.add_argument("--date", type=date.fromisoformat, help="Pretend today is YYYY-MM-DD.")
        parser.add_argument("--tz", default=settings.DEFAULT_USER_TIMEZONE, help="The user's time zone.")
        parser.add_argument(
            "--template",
            action="store_true",
            help="Load from core/demo_seed.json instead of running seed.ts (no Node needed; used in production).",
        )

    def handle(self, *args, **opts):
        if opts["template"]:
            exported = demo.shifted(demo.template(), opts["date"] or demo.demo_today())
        else:
            try:
                exported = export_seed(opts["date"], opts["tz"])
            except SeedError as e:
                raise CommandError(str(e)) from e
        user, ids = load_seed(exported, opts["email"])
        if user.email == settings.DEMO_USER_EMAIL:
            from accounts.models import GmailConnection

            GmailConnection.objects.filter(user=user).update(demo_seeded_for=date.fromisoformat(exported["today"]))
        s = exported["seed"]
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {user.email} for {exported['today']} ({exported['timeZone']}): "
                f"{len(s['opportunities'])} opportunities, {len(s['emails'])} emails, {len(s['interviews'])} interviews."
            )
        )
