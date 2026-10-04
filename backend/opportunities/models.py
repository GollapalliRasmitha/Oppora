import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

from core.domain.constants import OPPORTUNITY_TYPES, PRIORITIES


def empty_reasons():
    return {"skills": "unknown", "interests": "unmet", "experience": "unknown", "matchedSkills": [], "matchedInterests": []}


class Opportunity(models.Model):
    """Fields the email doesn't state stay null / empty ("Not mentioned in email")."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="opportunities")
    title = models.CharField(max_length=200)
    organization = models.CharField(max_length=200)
    type = models.CharField(max_length=16, choices=[(t, t) for t in OPPORTUNITY_TYPES])
    priority = models.CharField(max_length=8, choices=[(p, p) for p in PRIORITIES], default="Medium")
    match_score = models.PositiveSmallIntegerField(default=0)
    discovered_at = models.DateTimeField()
    summary = models.TextField(null=True, blank=True)
    location = models.CharField(max_length=200, null=True, blank=True)
    duration = models.CharField(max_length=100, null=True, blank=True)
    eligibility = models.TextField(null=True, blank=True)
    skills = models.JSONField(default=list, blank=True)
    requirements = models.JSONField(default=list, blank=True)
    benefits = models.JSONField(default=list, blank=True)
    application_link = models.URLField(max_length=500, null=True, blank=True)
    #: Why it matched (skills / interests / experience), stored so the UI can explain.
    match_reasons = models.JSONField(default=empty_reasons)
    #: How the match % was computed (mail.pipeline.score_breakdown); null for seeded demo data.
    score_breakdown = models.JSONField(null=True, blank=True)
    reminder_set = models.BooleanField(default=False)
    #: "Not interested": hidden everywhere, reversible.
    dismissed = models.BooleanField(default=False)
    #: Set only when the email itself states a fee/registration charge (quoted in fee_text).
    fee_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    fee_currency = models.CharField(max_length=8, blank=True)
    fee_text = models.CharField(max_length=300, blank=True)
    #: When the source emails were last checked for a fee (None = not checked yet).
    fee_checked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "dismissed"], name="opp_user_dismissed"),
            models.Index(fields=["user", "type"], name="opp_user_type"),
            models.Index(fields=["user", "-discovered_at"], name="opp_user_discovered"),
            models.Index(fields=["user", "priority"], name="opp_user_priority"),
        ]
        ordering = ["-match_score", "-discovered_at"]

    def __str__(self):
        return self.title


class Deadline(models.Model):
    class Kind(models.TextChoices):
        APPLICATION = "application"
        HACKATHON = "hackathon"
        SCHOLARSHIP = "scholarship"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="deadlines")
    opportunity = models.OneToOneField(Opportunity, on_delete=models.CASCADE, related_name="deadline")
    due_date = models.DateField()
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.APPLICATION)
    source_email = models.ForeignKey("mail.Email", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        indexes = [models.Index(fields=["user", "due_date"], name="deadline_user_due")]
        ordering = ["due_date"]


class Application(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress"
        APPLIED = "applied"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="applications")
    opportunity = models.OneToOneField(Opportunity, on_delete=models.CASCADE, related_name="application")
    status = models.CharField(max_length=12, choices=Status.choices)
    started_at = models.DateTimeField()
    applied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "status"], name="application_user_status")]
        ordering = ["-started_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(status="in_progress", applied_at__isnull=True) | Q(status="applied", applied_at__isnull=False),
                name="application_applied_at_matches_status",
            )
        ]


class SavedItem(models.Model):
    """A bookmark on exactly one opportunity or one email."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_items")
    opportunity = models.ForeignKey(Opportunity, null=True, blank=True, on_delete=models.CASCADE, related_name="saves")
    email = models.ForeignKey("mail.Email", null=True, blank=True, on_delete=models.CASCADE, related_name="saves")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(opportunity__isnull=False, email__isnull=True) | Q(opportunity__isnull=True, email__isnull=False),
                name="saved_item_exactly_one_target",
            ),
            models.UniqueConstraint(
                fields=["user", "opportunity"], condition=Q(opportunity__isnull=False), name="uniq_saved_opportunity"
            ),
            models.UniqueConstraint(fields=["user", "email"], condition=Q(email__isnull=False), name="uniq_saved_email"),
        ]
        ordering = ["-created_at"]


class Interview(models.Model):
    """Scheduled from an invitation email (calendar + assistant)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="interviews")
    opportunity = models.ForeignKey(Opportunity, on_delete=models.CASCADE, related_name="interviews")
    title = models.CharField(max_length=200)
    start = models.DateTimeField()
    #: Null when the email doesn't say how long it lasts.
    end = models.DateTimeField(null=True, blank=True)
    location = models.CharField(max_length=200, null=True, blank=True)
    source_email = models.ForeignKey("mail.Email", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        indexes = [models.Index(fields=["user", "start"], name="interview_user_start")]
        ordering = ["start"]


class HiddenSender(models.Model):
    """ "Hide all from this sender": their opportunities are hidden and their future emails skipped."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="hidden_senders")
    sender_email = models.EmailField()
    sender_name = models.CharField(max_length=200, blank=True)
    #: Opportunities this rule hid, so "Show again" restores exactly those.
    hidden_opportunity_ids = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "sender_email"], name="uniq_hidden_sender")]
        ordering = ["-created_at"]
