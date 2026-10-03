import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models

from core.domain.constants import OPPORTUNITY_TYPES


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("Users need an email address.")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password) if password else user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True)
        return self.create_user(email, password, **extra)


class User(AbstractUser):
    """Signs in with Google (Stage 8), so there is no username and usually no password."""

    class Plan(models.TextChoices):
        FREE = "Free"
        PRO = "Pro"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = None
    first_name = None
    last_name = None
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=80)
    plan = models.CharField(max_length=8, choices=Plan.choices, default=Plan.FREE)
    interests = models.JSONField(default=list, blank=True)
    skills = models.JSONField(default=list, blank=True)
    experience_level = models.CharField(max_length=80, null=True, blank=True)
    timezone = models.CharField(max_length=64, default=settings.DEFAULT_USER_TIMEZONE)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []
    objects = UserManager()

    def __str__(self):
        return self.email


def default_categories():
    return list(OPPORTUNITY_TYPES)


class UserPreference(models.Model):
    class Personalization(models.TextChoices):
        LOW = "low"
        BALANCED = "balanced"
        HIGH = "high"

    MINIMUM_MATCH_CHOICES = [(0, "Any"), (50, "50%"), (70, "70%"), (85, "85%")]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, primary_key=True, related_name="preferences")
    notify_email = models.BooleanField(default=True)
    notify_deadline_reminders = models.BooleanField(default=True)
    notify_new_opportunities = models.BooleanField(default=True)
    notify_weekly_digest = models.BooleanField(default=False)
    language = models.CharField(max_length=8, choices=[("en", "English")], default="en")
    minimum_match = models.PositiveSmallIntegerField(choices=MINIMUM_MATCH_CHOICES, default=0)
    preferred_locations = models.JSONField(default=list, blank=True)
    ai_recommendations = models.BooleanField(default=True)
    personalization = models.CharField(max_length=10, choices=Personalization.choices, default=Personalization.BALANCED)
    categories = models.JSONField(default=default_categories)


class GmailConnection(models.Model):
    """
    Connection status plus the sync state the UI polls. OAuth tokens are added
    in Stage 8 (encrypted at rest in Stage 10) and never leave the server.
    """

    class Status(models.TextChoices):
        CONNECTED = "connected"
        NEEDS_RECONNECT = "needs_reconnect"
        DISCONNECTED = "disconnected"

    class Phase(models.TextChoices):
        IDLE = "idle"
        SCANNING = "scanning"
        ANALYZING = "analyzing"
        COMPLETED = "completed"
        ERROR = "error"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, primary_key=True, related_name="gmail")
    email = models.EmailField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DISCONNECTED)
    connected_at = models.DateTimeField(null=True, blank=True)
    scopes = models.JSONField(default=list, blank=True)
    initial_sync_days = models.PositiveSmallIntegerField(default=60)

    sync_phase = models.CharField(max_length=10, choices=Phase.choices, default=Phase.IDLE)
    sync_started_at = models.DateTimeField(null=True, blank=True)
    sync_emails_in_batch = models.PositiveIntegerField(default=0)
    last_synced_at = models.DateTimeField(null=True, blank=True)
