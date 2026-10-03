from datetime import timedelta

from django.db import transaction
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import GmailConnection
from accounts.serializers import SyncStatusSerializer

from . import clock
from .api import GmailAccessError
from .data import email_dicts, interview_dicts, opportunity_dicts
from .domain.assistant import answer_question
from .domain.insights import TREND_RANGES, compute_insights
from .domain.stats import (
    build_recommendation,
    compute_dashboard_stats,
    latest_opportunities,
    recent_email_count,
    upcoming_deadlines,
)


class DashboardView(APIView):
    """GET /api/insights/dashboard/ — stat cards, latest, upcoming and the AI recommendation."""

    def get(self, request):
        now = clock.user_now(request)
        opps = opportunity_dicts(request.user)
        recommendations = request.user.preferences.ai_recommendations
        return Response(
            {
                "stats": compute_dashboard_stats(opps, now),
                "latest": latest_opportunities(opps),
                "upcoming": upcoming_deadlines(opps, now),
                "recommendation": build_recommendation(opps, now) if recommendations else None,
            }
        )


class InsightsQuery(serializers.Serializer):
    range = serializers.ChoiceField(choices=TREND_RANGES, default=7)


class InsightsView(APIView):
    """GET /api/insights/?range=7|30"""

    def get(self, request):
        q = InsightsQuery(data=request.query_params)
        q.is_valid(raise_exception=True)
        now = clock.user_now(request)
        data = compute_insights(opportunity_dicts(request.user), email_dicts(request.user), now, int(q.validated_data["range"]))
        if not request.user.preferences.ai_recommendations:
            data["recommendation"] = None
        return Response(data)


# Stage 7 simulates the scan's phases from elapsed time; Stage 9 replaces this
# with the Celery job reporting real progress. The response shape stays.
SCANNING_FOR = timedelta(seconds=1.4)
COMPLETES_AFTER = timedelta(seconds=3.6)


def _advance(g: GmailConnection, now) -> None:
    if g.sync_phase not in (GmailConnection.Phase.SCANNING, GmailConnection.Phase.ANALYZING) or not g.sync_started_at:
        return
    elapsed = now - g.sync_started_at
    if elapsed >= COMPLETES_AFTER:
        g.sync_phase, g.last_synced_at = GmailConnection.Phase.COMPLETED, g.sync_started_at + COMPLETES_AFTER
    elif elapsed >= SCANNING_FOR:
        g.sync_phase = GmailConnection.Phase.ANALYZING
    else:
        return
    g.save(update_fields=["sync_phase", "last_synced_at"])


class SyncView(APIView):
    """GET /api/sync/ — status (polled by the UI). POST /api/sync/ — start a scan (needs a connected Gmail)."""

    def get(self, request):
        g = request.user.gmail
        _advance(g, clock.now())
        data = SyncStatusSerializer(g).data
        if g.sync_phase != GmailConnection.Phase.ANALYZING:
            data["emailsInBatch"] = 0
        return Response(data)

    def post(self, request):
        with transaction.atomic():
            g = GmailConnection.objects.select_for_update().get(user=request.user)
            if g.status != GmailConnection.Status.CONNECTED:
                raise GmailAccessError()
            now = clock.now()
            _advance(g, now)
            if g.sync_phase not in (GmailConnection.Phase.SCANNING, GmailConnection.Phase.ANALYZING):
                g.sync_phase = GmailConnection.Phase.SCANNING
                g.sync_started_at = now
                g.sync_emails_in_batch = recent_email_count(email_dicts(request.user), clock.user_now(request))
                g.save(update_fields=["sync_phase", "sync_started_at", "sync_emails_in_batch"])
        data = SyncStatusSerializer(g).data
        if g.sync_phase != GmailConnection.Phase.ANALYZING:
            data["emailsInBatch"] = 0
        return Response(data, status=202)


class AssistantQuery(serializers.Serializer):
    question = serializers.CharField(max_length=500, trim_whitespace=True)
    opportunityId = serializers.UUIDField(required=False, allow_null=True)


class AssistantView(APIView):
    """
    POST /api/assistant/ {question, opportunityId?} — answers only from the
    user's own stored opportunities, emails and interviews.
    """

    def post(self, request):
        q = AssistantQuery(data=request.data)
        q.is_valid(raise_exception=True)
        user = request.user
        data = {"opportunities": opportunity_dicts(user), "emails": email_dicts(user), "interviews": interview_dicts(user)}
        opp_id = q.validated_data.get("opportunityId")
        return Response(
            answer_question(
                q.validated_data["question"], data, clock.user_now(request), {"opportunityId": str(opp_id) if opp_id else None}
            )
        )
