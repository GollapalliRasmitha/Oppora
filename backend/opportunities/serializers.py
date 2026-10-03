from django.db.models import Exists, OuterRef, Prefetch
from rest_framework import serializers

from mail.models import Email

from .models import Application, Deadline, Interview, Opportunity, SavedItem


def opportunities_for(user):
    """Every queryset is scoped to the requesting user, with what the serializer needs in 3 queries."""
    return (
        Opportunity.objects.filter(user=user)
        .select_related("deadline", "application")
        .prefetch_related(Prefetch("emails", queryset=Email.objects.only("id", "opportunity_id").order_by("received_at")))
        .annotate(is_saved=Exists(SavedItem.objects.filter(user=user, opportunity=OuterRef("pk"))))
    )


class ApplicationStateSerializer(serializers.ModelSerializer):
    startedAt = serializers.DateTimeField(source="started_at")
    appliedAt = serializers.DateTimeField(source="applied_at", allow_null=True)

    class Meta:
        model = Application
        fields = ["status", "startedAt", "appliedAt"]


class OpportunitySerializer(serializers.ModelSerializer):
    """Matches the frontend `Opportunity` type. Only reminderSet and dismissed are writable here."""

    deadline = serializers.SerializerMethodField()
    matchScore = serializers.IntegerField(source="match_score", read_only=True)
    discoveredAt = serializers.DateTimeField(source="discovered_at", read_only=True)
    applicationLink = serializers.URLField(source="application_link", read_only=True)
    matchReasons = serializers.JSONField(source="match_reasons", read_only=True)
    sourceEmailIds = serializers.SerializerMethodField()
    saved = serializers.SerializerMethodField()
    application = serializers.SerializerMethodField()
    reminderSet = serializers.BooleanField(source="reminder_set", required=False)
    fee = serializers.SerializerMethodField()

    class Meta:
        model = Opportunity
        fields = [
            "id",
            "title",
            "organization",
            "type",
            "deadline",
            "priority",
            "matchScore",
            "discoveredAt",
            "summary",
            "location",
            "duration",
            "eligibility",
            "skills",
            "requirements",
            "benefits",
            "applicationLink",
            "matchReasons",
            "sourceEmailIds",
            "saved",
            "application",
            "reminderSet",
            "dismissed",
            "fee",
        ]
        read_only_fields = [
            "id",
            "title",
            "organization",
            "type",
            "priority",
            "summary",
            "location",
            "duration",
            "eligibility",
            "skills",
            "requirements",
            "benefits",
        ]

    def get_deadline(self, obj):
        d = obj.deadline if _has(obj, "deadline") else None
        return d.due_date.isoformat() if d else None

    def get_fee(self, obj):
        """Only when the email stated a fee: {amount, currency, text} (text = the email's own sentence)."""
        if not obj.fee_text:
            return None
        return {
            "amount": float(obj.fee_amount) if obj.fee_amount is not None else None,
            "currency": obj.fee_currency or None,
            "text": obj.fee_text,
        }

    def get_sourceEmailIds(self, obj):
        return [str(e.id) for e in obj.emails.all()]

    def get_saved(self, obj):
        if hasattr(obj, "is_saved"):
            return obj.is_saved
        return obj.saves.exists()

    def get_application(self, obj):
        app = obj.application if _has(obj, "application") else None
        return ApplicationStateSerializer(app).data if app else None


def _has(obj, related: str) -> bool:
    try:
        return getattr(obj, related) is not None
    except Exception:  # RelatedObjectDoesNotExist
        return False


class DeadlineSerializer(serializers.ModelSerializer):
    opportunityId = serializers.UUIDField(source="opportunity_id", read_only=True)
    date = serializers.DateField(source="due_date", read_only=True)
    title = serializers.CharField(source="opportunity.title", read_only=True)
    organization = serializers.CharField(source="opportunity.organization", read_only=True)

    class Meta:
        model = Deadline
        fields = ["id", "opportunityId", "date", "kind", "title", "organization"]


class InterviewSerializer(serializers.ModelSerializer):
    opportunityId = serializers.UUIDField(source="opportunity_id")
    sourceEmailId = serializers.UUIDField(source="source_email_id", allow_null=True)

    class Meta:
        model = Interview
        fields = ["id", "opportunityId", "title", "start", "end", "location", "sourceEmailId"]


class UserScopedPK(serializers.PrimaryKeyRelatedField):
    """A related id that must belong to the requesting user (else: "does not exist")."""

    def get_queryset(self):
        return super().get_queryset().filter(user=self.context["request"].user)


class ApplicationSerializer(serializers.ModelSerializer):
    opportunityId = UserScopedPK(source="opportunity", queryset=Opportunity.objects.all())
    startedAt = serializers.DateTimeField(source="started_at", read_only=True)
    appliedAt = serializers.DateTimeField(source="applied_at", read_only=True)

    class Meta:
        model = Application
        fields = ["id", "opportunityId", "status", "startedAt", "appliedAt"]


class SavedItemSerializer(serializers.ModelSerializer):
    opportunityId = UserScopedPK(source="opportunity", queryset=Opportunity.objects.all(), required=False, allow_null=True)
    emailId = UserScopedPK(source="email", queryset=Email.objects.all(), required=False, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = SavedItem
        fields = ["id", "opportunityId", "emailId", "createdAt"]

    def validate(self, attrs):
        if bool(attrs.get("opportunity")) == bool(attrs.get("email")):
            raise serializers.ValidationError("Save exactly one of opportunityId or emailId.")
        return attrs
