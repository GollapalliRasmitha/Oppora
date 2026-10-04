from django.core.management.base import BaseCommand

from accounts.models import User
from core import clock
from mail.pipeline import rescore


class Command(BaseCommand):
    help = (
        "Re-explains every match and recomputes the match % (with its breakdown) of AI-found opportunities, "
        "reusing the relevance the AI already stored. Makes no AI requests. Seeded demo scores stay as designed."
    )

    def handle(self, *args, **opts):
        for user in User.objects.filter(opportunities__isnull=False).distinct():
            now = clock.now().astimezone(clock.zone(user.timezone) or clock.zone("UTC"))
            changed = rescore(user, now)
            self.stdout.write(f"Re-scored one account: {changed} match scores changed.")
