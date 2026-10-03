from django.conf import settings
from django.contrib.auth import login, logout
from django.db import transaction
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core import clock
from core.domain.match import explain_match
from core.seed import clear_user_data
from opportunities.models import Opportunity

from .models import GmailConnection, User
from .serializers import GmailConnectionSerializer, PreferencesSerializer, UserSerializer


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """GET /api/auth/csrf/ — sets the csrftoken cookie the frontend echoes in X-CSRFToken."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class DevLoginView(APIView):
    """
    POST /api/auth/dev-login/ — Stage 7 stand-in for Google sign-in: logs in
    the seeded demo user. Only exists while DEBUG and DJANGO_DEV_LOGIN are on.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        if not settings.DEV_LOGIN_ENABLED:
            raise NotFound()
        user = User.objects.filter(email=settings.DEMO_USER_EMAIL, is_active=True).first()
        if not user:
            return Response(
                {"error": {"code": "not_seeded", "message": "No demo user yet. Run `python manage.py seed_demo`."}},
                status=status.HTTP_409_CONFLICT,
            )
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """GET/PATCH /api/auth/me/ — profile changes re-explain every match so AI Summaries stay truthful."""

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    @transaction.atomic
    def patch(self, request):
        s = UserSerializer(request.user, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        user = s.save()
        if {"interests", "skills", "experienceLevel"} & set(request.data):
            profile = {"interests": user.interests, "skills": user.skills, "experienceLevel": user.experience_level}
            opps = list(Opportunity.objects.filter(user=user))
            for o in opps:
                o.match_reasons = explain_match(
                    {"title": o.title, "type": o.type, "skills": o.skills, "eligibility": o.eligibility}, profile
                )
            Opportunity.objects.bulk_update(opps, ["match_reasons"])
        return Response(UserSerializer(user).data)


class MyDataView(APIView):
    """
    DELETE /api/auth/me/data/ — deletes every opportunity, email, interview and
    notification Oppora stored, and disconnects Gmail. Account and preferences remain.
    """

    def delete(self, request):
        with transaction.atomic():
            clear_user_data(request.user)
            GmailConnection.objects.filter(user=request.user).update(
                status=GmailConnection.Status.DISCONNECTED,
                connected_at=None,
                sync_phase=GmailConnection.Phase.IDLE,
                sync_started_at=None,
                sync_emails_in_batch=0,
                last_synced_at=None,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class PreferencesView(APIView):
    def get(self, request):
        return Response(PreferencesSerializer(request.user.preferences).data)

    def patch(self, request):
        s = PreferencesSerializer(request.user.preferences, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        return Response(PreferencesSerializer(s.save()).data)


class GmailStatusView(APIView):
    def get(self, request):
        return Response(GmailConnectionSerializer(request.user.gmail).data)


class GmailConnectView(APIView):
    """
    POST /api/auth/gmail/connect/ — Stage 8 replaces this with the Google OAuth
    redirect. Until then it marks the connection as connected (dev only).
    """

    def post(self, request):
        if not settings.DEV_LOGIN_ENABLED:
            raise NotFound()
        g = request.user.gmail
        g.email = request.user.email
        g.status = GmailConnection.Status.CONNECTED
        g.connected_at = clock.now()
        g.scopes = ["gmail.readonly", "openid", "email", "profile"]
        if g.sync_phase == GmailConnection.Phase.ERROR:
            g.sync_phase = GmailConnection.Phase.COMPLETED if g.last_synced_at else GmailConnection.Phase.IDLE
        g.save()
        return Response(GmailConnectionSerializer(g).data)


class GmailDisconnectView(APIView):
    """POST /api/auth/gmail/disconnect/ — Stage 8 also revokes the token and deletes stored tokens."""

    def post(self, request):
        g = request.user.gmail
        g.status = GmailConnection.Status.DISCONNECTED
        g.connected_at = None
        g.save(update_fields=["status", "connected_at"])
        return Response(GmailConnectionSerializer(g).data)
