from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import GmailConnection
from core.crypto import _fernet


class Command(BaseCommand):
    help = (
        "Re-encrypts every stored OAuth token with the FIRST key in TOKEN_ENCRYPTION_KEY. "
        "To rotate: put a new key first (TOKEN_ENCRYPTION_KEY=new,old), run this, then remove the old key."
    )

    def handle(self, *args, **opts):
        f = _fernet()
        done = 0
        with transaction.atomic():
            for g in GmailConnection.objects.select_for_update().exclude(refresh_token_enc="", access_token_enc=""):
                for field in ("refresh_token_enc", "access_token_enc"):
                    value = getattr(g, field)
                    if value:
                        try:
                            setattr(g, field, f.rotate(value.encode()).decode())
                        except Exception as e:
                            raise CommandError(
                                "A stored token can't be decrypted with any configured key; nothing was changed."
                            ) from e
                g.save(update_fields=["refresh_token_enc", "access_token_enc"])
                done += 1
        self.stdout.write(self.style.SUCCESS(f"Re-encrypted tokens for {done} connection(s) with the current key."))
