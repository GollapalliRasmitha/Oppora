from django.db.models import Exists, OuterRef
from rest_framework import serializers

from opportunities.models import SavedItem

from .models import Email


def emails_for(user):
    return (
        Email.objects.filter(user=user)
        .select_related("classification")
        .annotate(is_saved=Exists(SavedItem.objects.filter(user=user, email=OuterRef("pk"))))
    )


class EmailSerializer(serializers.ModelSerializer):
    """Matches the frontend `Email` type. Only read and archived are writable (saving uses /api/saved/)."""

    senderEmail = serializers.EmailField(source="sender_email", read_only=True)
    receivedAt = serializers.DateTimeField(source="received_at", read_only=True)
    category = serializers.SerializerMethodField()
    relevance = serializers.SerializerMethodField()
    saved = serializers.SerializerMethodField()
    opportunityId = serializers.UUIDField(source="opportunity_id", read_only=True, allow_null=True)

    class Meta:
        model = Email
        fields = [
            "id",
            "sender",
            "senderEmail",
            "subject",
            "snippet",
            "receivedAt",
            "category",
            "relevance",
            "read",
            "saved",
            "archived",
            "opportunityId",
        ]
        read_only_fields = ["id", "sender", "subject", "snippet"]

    def _classification(self, obj):
        try:
            return obj.classification
        except Email.classification.RelatedObjectDoesNotExist:
            return None

    def get_category(self, obj):
        c = self._classification(obj)
        return c.category if c else "Other"

    def get_relevance(self, obj):
        c = self._classification(obj)
        return c.relevance if c else 0

    def get_saved(self, obj):
        return obj.is_saved if hasattr(obj, "is_saved") else obj.saves.exists()
