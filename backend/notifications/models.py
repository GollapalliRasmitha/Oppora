import uuid

from django.conf import settings
from django.db import models


class Notification(models.Model):
    """
    Bell notifications. Derived from the user's data (core.domain.notifications)
    and upserted by `key`, so read/cleared state survives re-derivation; the
    Stage 9 workers create them the same way.
    """

    class Kind(models.TextChoices):
        NEW_OPPORTUNITY = "new_opportunity"
        DEADLINE = "deadline"
        AI_RECOMMENDATION = "ai_recommendation"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    key = models.CharField(max_length=120)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    title = models.CharField(max_length=120)
    body = models.CharField(max_length=300)
    created_at = models.DateTimeField()
    read = models.BooleanField(default=False)
    cleared = models.BooleanField(default=False)
    opportunity = models.ForeignKey(
        "opportunities.Opportunity", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "key"], name="uniq_notification_key")]
        indexes = [models.Index(fields=["user", "cleared"], name="notification_user_cleared")]
        ordering = ["created_at"]
