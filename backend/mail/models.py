import uuid

from django.conf import settings
from django.db import models

from core.domain.constants import EMAIL_CATEGORIES


class Email(models.Model):
    """
    Only what Oppora needs (PROMPT.md §7 privacy): message id, sender, subject,
    date and a short snippet — never the full body.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="emails")
    gmail_message_id = models.CharField(max_length=128)
    sender = models.CharField(max_length=200)
    sender_email = models.EmailField()
    subject = models.CharField(max_length=300)
    snippet = models.CharField(max_length=500, blank=True)
    received_at = models.DateTimeField()
    read = models.BooleanField(default=False)
    archived = models.BooleanField(default=False)
    opportunity = models.ForeignKey(
        "opportunities.Opportunity", null=True, blank=True, on_delete=models.SET_NULL, related_name="emails"
    )

    class Meta:
        constraints = [
            # Idempotency key for the Gmail pipeline: one row per message per user.
            models.UniqueConstraint(fields=["user", "gmail_message_id"], name="uniq_email_per_user_message"),
        ]
        indexes = [
            models.Index(fields=["user", "-received_at"], name="email_user_received"),
            models.Index(fields=["user", "archived"], name="email_user_archived"),
            models.Index(fields=["user", "opportunity"], name="email_user_opportunity"),
        ]
        ordering = ["-received_at"]


class EmailClassification(models.Model):
    class Status(models.TextChoices):
        CLASSIFIED = "classified"
        NEEDS_REVIEW = "needs_review"

    email = models.OneToOneField(Email, on_delete=models.CASCADE, primary_key=True, related_name="classification")
    category = models.CharField(max_length=16, choices=[(c, c) for c in EMAIL_CATEGORIES], default="Other")
    #: AI relevance to the user's interests, 0–100.
    relevance = models.PositiveSmallIntegerField(default=0)
    confidence = models.FloatField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.CLASSIFIED)
    model_name = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["category"], name="classification_category")]
