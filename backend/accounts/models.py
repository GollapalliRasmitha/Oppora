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
    #: dark | light | system (follows the OS). The browser also keeps a copy so pages paint in it before any fetch.
    theme = models.CharField(max_length=8, choices=[("dark", "Dark"), ("light", "Light"), ("system", "System")], default="dark")
    minimum_match = models.PositiveSmallIntegerField(choices=MINIMUM_MATCH_CHOICES, default=0)
    preferred_locations = models.JSONField(default=list, blank=True)
    ai_recommendations = models.BooleanField(default=True)
    personalization = models.CharField(max_length=10, choices=Personalization.choices, default=Personalization.BALANCED)
    categories = models.JSONField(default=default_categories)

    class AIMode(models.TextChoices):
        ASK = "ask", "Not chosen yet"  # the consent screen comes before any scan
        AI = "ai", "Gemini (free tier)"
        RULES = "rules", "Rules only, no AI"

    #: The user's choice on the consent screen (changeable in Settings → Privacy). Nothing is scanned while "ask".
    ai_mode = models.CharField(max_length=8, choices=AIMode.choices, default=AIMode.ASK)
    ai_mode_set_at = models.DateTimeField(null=True, blank=True)


class GmailConnection(models.Model):
    """
    Connection status, OAuth tokens and the sync state the UI polls. Tokens are
    encrypted at rest (core.crypto) and never leave the server.
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

    #: The seeded demo account: no real mailbox, so scans are simulated.
    is_demo = models.BooleanField(default=False)
    #: Why the last sync left emails waiting ("" = it didn't): see mail.sync.WaitReason. Shown in the sync card.
    sync_wait_reason = models.CharField(max_length=16, blank=True)
    #: A short, content-free explanation (e.g. "Gemini 400: API key not valid") for the AI-unavailable case.
    sync_wait_detail = models.CharField(max_length=200, blank=True)
    #: Demo only: the day the sample data was loaded for (core.demo reloads it when the day changes).
    demo_seeded_for = models.DateField(null=True, blank=True)
    google_sub = models.CharField(max_length=64, blank=True)
    refresh_token_enc = models.TextField(blank=True)
    access_token_enc = models.TextField(blank=True)
    token_expiry = models.DateTimeField(null=True, blank=True)
    #: Gmail historyId of the last completed scan, for incremental sync.
    history_id = models.CharField(max_length=32, blank=True)

    sync_phase = models.CharField(max_length=10, choices=Phase.choices, default=Phase.IDLE)
    sync_started_at = models.DateTimeField(null=True, blank=True)
    sync_emails_in_batch = models.PositiveIntegerField(default=0)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    #: Emails waiting for the AI (e.g. after the free tier's daily limit).
    sync_queued = models.PositiveIntegerField(default=0)

    @property
    def refresh_token(self) -> str | None:
        from core.crypto import decrypt

        return decrypt(self.refresh_token_enc)

    @property
    def access_token(self) -> str | None:
        from core.crypto import decrypt

        return decrypt(self.access_token_enc)

    def set_tokens(self, *, refresh_token: str | None, access_token: str | None, expiry) -> None:
        from core.crypto import encrypt

        if refresh_token:  # Google only sends one on consent; keep the stored one otherwise
            self.refresh_token_enc = encrypt(refresh_token)
        self.access_token_enc = encrypt(access_token)
        self.token_expiry = expiry

    def clear_tokens(self) -> None:
        self.refresh_token_enc = self.access_token_enc = ""
        self.token_expiry = None
        self.history_id = ""
