from django.db import transaction
from rest_framework import serializers, status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from core import clock
from core.data import opportunity_dicts
from core.domain.dates import parse_dt
from core.domain.stats import derive_notifications

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    createdAt = serializers.DateTimeField(source="created_at")
    opportunityId = serializers.UUIDField(source="opportunity_id", allow_null=True)

    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "createdAt", "read", "opportunityId"]


def _enabled(user) -> dict[str, bool]:
    p = user.preferences
    return {
        "new_opportunity": p.notify_new_opportunities,
        "deadline": p.notify_deadline_reminders,
        "ai_recommendation": p.ai_recommendations,
    }


@transaction.atomic
def refresh_notifications(user, now) -> list[Notification]:
    """
    Upserts the derived notifications by key (read/cleared state is kept) and
    returns the current, non-cleared ones the user's settings allow.
    """
    derived = derive_notifications(opportunity_dicts(user), now)
    existing = {n.key: n for n in Notification.objects.select_for_update().filter(user=user, key__in=[d["key"] for d in derived])}
    enabled = _enabled(user)
    out = []
    for d in derived:
        n = existing.get(d["key"])
        if n is None:
            n = Notification.objects.create(
                user=user,
                key=d["key"],
                kind=d["kind"],
                title=d["title"],
                body=d["body"],
                created_at=parse_dt(d["createdAt"]),
                read=d["read"],
                opportunity_id=d["opportunityId"],
            )
        elif n.body != d["body"] or n.title != d["title"]:
            n.title, n.body = d["title"], d["body"]
            n.save(update_fields=["title", "body"])
        if not n.cleared and enabled[n.kind]:
            out.append(n)
    return out


class NotificationListView(APIView):
    """GET /api/notifications/ — respects the notification settings."""

    def get(self, request):
        items = refresh_notifications(request.user, clock.user_now(request))
        return Response(NotificationSerializer(items, many=True).data)


class NotificationReadView(APIView):
    """POST /api/notifications/<id>/read/"""

    def post(self, request, pk):
        n = get_object_or_404(Notification, pk=pk, user=request.user)
        if not n.read:
            n.read = True
            n.save(update_fields=["read"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClearSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), max_length=200)


class NotificationClearView(APIView):
    """POST /api/notifications/clear/ {ids: [...]} — clears the given notifications (only the user's own)."""

    def post(self, request):
        s = ClearSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        Notification.objects.filter(user=request.user, id__in=s.validated_data["ids"]).update(cleared=True, read=True)
        return Response(status=status.HTTP_204_NO_CONTENT)
