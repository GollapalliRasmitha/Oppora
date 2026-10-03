from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import GmailConnection
from accounts.serializers import SyncStatusSerializer
from mail import sync

from . import clock
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
from .throttling import ScopedThrottle, SyncStartThrottle, UserThrottle


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


def _sync_payload(g: GmailConnection) -> dict:
    data = SyncStatusSerializer(g).data
    if g.sync_phase != GmailConnection.Phase.ANALYZING:
        data["emailsInBatch"] = 0
    return data


class SyncView(APIView):
    """
    GET /api/sync/ — status (polled by the UI while a scan runs).
    POST /api/sync/ — start a scan in the background (409 gmail_access unless Gmail is connected).
    """

    throttle_classes = [UserThrottle, SyncStartThrottle]

    def get(self, request):
        g = request.user.gmail
        sync.advance_demo(g, clock.now())
        sync.resume_if_interrupted(g)
        return Response(_sync_payload(g))

    def post(self, request):
        demo_batch = 0
        if request.user.gmail.is_demo:
            demo_batch = recent_email_count(email_dicts(request.user), clock.user_now(request))
        g = sync.start_sync(request.user, demo_batch=demo_batch)
        return Response(_sync_payload(g), status=202)


class AssistantQuery(serializers.Serializer):
    question = serializers.CharField(max_length=500, trim_whitespace=True)
    opportunityId = serializers.UUIDField(required=False, allow_null=True)


class AssistantView(APIView):
    """
    POST /api/assistant/ {question, opportunityId?} — answers only from the
    user's own stored opportunities, emails and interviews.
    """

    throttle_classes = [UserThrottle, ScopedThrottle]
    throttle_scope = "assistant"

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
