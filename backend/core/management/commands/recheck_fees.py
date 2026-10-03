from django.core.management.base import BaseCommand

from accounts.models import GmailConnection
from ai.providers.base import AIError
from mail.fees import recheck_fees
from mail.gmail import GmailAuthError, GmailClient


class Command(BaseCommand):
    help = (
        "Re-checks stored opportunities for a fee stated in their emails (re-reading them from Gmail, read-only). "
        "Uses AI requests only for emails that mention paying. The sync also does this automatically."
    )

    def handle(self, *args, **opts):
        for g in GmailConnection.objects.filter(is_demo=False, status=GmailConnection.Status.CONNECTED).select_related("user"):
            try:
                client = GmailClient.for_connection(g)
            except GmailAuthError:
                client = None
                self.stdout.write(self.style.WARNING("Gmail needs reconnecting for one account: using stored snippets."))
            try:
                result = recheck_fees(g.user, client)
            except AIError as e:
                self.stdout.write(self.style.WARNING(f"AI unavailable ({type(e).__name__}); try again later."))
                continue
            if result["waiting"]:
                self.stdout.write(
                    self.style.WARNING(
                        f"{result['waiting']} mention paying and wait for the AI (daily limit); the next sync finishes them."
                    )
                )
            self.stdout.write(
                self.style.SUCCESS(f"Checked {result['checked']} opportunities, {result['flagged']} ask for a fee.")
            )
