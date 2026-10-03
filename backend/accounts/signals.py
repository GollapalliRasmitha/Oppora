from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import GmailConnection, User, UserPreference


@receiver(post_save, sender=User)
def create_user_rows(sender, instance, created, **kwargs):
    """Every user always has preferences and a (disconnected) Gmail connection row."""
    if created:
        UserPreference.objects.get_or_create(user=instance)
        GmailConnection.objects.get_or_create(user=instance, defaults={"initial_sync_days": settings.GMAIL_INITIAL_SYNC_DAYS})
