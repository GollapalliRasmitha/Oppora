from rest_framework import serializers

from core.domain.constants import OPPORTUNITY_TYPES

from .models import GmailConnection, User, UserPreference


def tag():
    return serializers.CharField(max_length=60, trim_whitespace=True)


def _unique(values: list[str]) -> list[str]:
    seen, out = set(), []
    for v in values:
        k = v.lower()
        if v and k not in seen:
            seen.add(k)
            out.append(v)
    return out


class UserSerializer(serializers.ModelSerializer):
    """Matches the frontend `User` type. Editable: name, interests, skills, experienceLevel."""

    experienceLevel = serializers.CharField(
        source="experience_level", allow_null=True, allow_blank=True, max_length=80, required=False
    )
    interests = serializers.ListField(child=tag(), max_length=20, required=False)
    skills = serializers.ListField(child=tag(), max_length=40, required=False)
    name = serializers.CharField(max_length=80, min_length=1, trim_whitespace=True, required=False)

    class Meta:
        model = User
        fields = ["id", "name", "email", "plan", "interests", "skills", "experienceLevel"]
        read_only_fields = ["id", "email", "plan"]

    def validate_interests(self, v):
        return _unique(v)

    def validate_skills(self, v):
        return _unique(v)

    def validate_experienceLevel(self, v):
        return v or None


class NotificationPrefs(serializers.Serializer):
    email = serializers.BooleanField(source="notify_email", required=False)
    deadlineReminders = serializers.BooleanField(source="notify_deadline_reminders", required=False)
    newOpportunities = serializers.BooleanField(source="notify_new_opportunities", required=False)
    weeklyDigest = serializers.BooleanField(source="notify_weekly_digest", required=False)


class AIPrefs(serializers.Serializer):
    recommendations = serializers.BooleanField(source="ai_recommendations", required=False)
    personalization = serializers.ChoiceField(choices=UserPreference.Personalization.choices, required=False)
    categories = serializers.ListField(
        child=serializers.ChoiceField(choices=OPPORTUNITY_TYPES), max_length=len(OPPORTUNITY_TYPES), required=False
    )

    def validate_categories(self, v):
        return [t for t in OPPORTUNITY_TYPES if t in set(v)]  # canonical order, no duplicates


class PreferencesSerializer(serializers.Serializer):
    """Matches the frontend `Preferences` type; PATCH merges nested groups."""

    notifications = NotificationPrefs(source="*", required=False)
    language = serializers.ChoiceField(choices=["en"], required=False)
    theme = serializers.ChoiceField(choices=["dark", "light", "system"], required=False)
    minimumMatch = serializers.ChoiceField(source="minimum_match", choices=[0, 50, 70, 85], required=False)
    preferredLocations = serializers.ListField(source="preferred_locations", child=tag(), max_length=20, required=False)
    ai = AIPrefs(source="*", required=False)

    def validate_preferredLocations(self, v):
        return _unique(v)

    def update(self, instance, validated):
        flat = {}
        for k, v in validated.items():
            flat.update(v) if isinstance(v, dict) else flat.__setitem__(k, v)
        for k, v in flat.items():
            setattr(instance, k, v)
        instance.save(update_fields=list(flat))
        return instance


class GmailConnectionSerializer(serializers.ModelSerializer):
    connectedAt = serializers.DateTimeField(source="connected_at")
    initialSyncDays = serializers.IntegerField(source="initial_sync_days")

    class Meta:
        model = GmailConnection
        fields = ["email", "status", "connectedAt", "scopes", "initialSyncDays"]
        read_only_fields = fields


class SyncStatusSerializer(serializers.ModelSerializer):
    phase = serializers.CharField(source="sync_phase")
    emailsInBatch = serializers.IntegerField(source="sync_emails_in_batch")
    lastSyncedAt = serializers.DateTimeField(source="last_synced_at")
    #: Emails waiting for the AI (its free-tier daily limit was reached); processed on the next sync.
    queued = serializers.IntegerField(source="sync_queued")

    class Meta:
        model = GmailConnection
        fields = ["phase", "emailsInBatch", "lastSyncedAt", "queued"]
        read_only_fields = fields
