import secrets

from cryptography.fernet import Fernet
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Prints new random production secrets to paste into the hosting dashboard (Render). "
        "Run it in your own terminal; nothing is saved or sent anywhere."
    )

    def handle(self, *args, **opts):
        self.stdout.write("Paste each value into Render → oppora-api → Environment. Don't commit or share them.\n")
        self.stdout.write(f"DJANGO_SECRET_KEY={secrets.token_urlsafe(64)}")
        self.stdout.write(f"TOKEN_ENCRYPTION_KEY={Fernet.generate_key().decode()}")
        self.stdout.write(f"CRON_SECRET={secrets.token_urlsafe(48)}")
        self.stdout.write(
            "\nCRON_SECRET also goes into GitHub → Settings → Secrets and variables → Actions → OPPORA_CRON_SECRET."
        )
