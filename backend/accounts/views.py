import logging
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import login, logout
from django.db import transaction
from django.http import HttpResponseRedirect
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core import clock
from core.seed import clear_user_data
from core.throttling import AuthIPThrottle, auth_rate_limited

from . import google
from .models import GmailConnection, User
from .serializers import GmailConnectionSerializer, PreferencesSerializer, UserSerializer

log = logging.getLogger(__name__)


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

    throttle_classes = [AuthIPThrottle]

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
    throttle_classes = [AuthIPThrottle]

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
            from mail.pipeline import rescore

            rescore(user, clock.user_now(request))
        return Response(UserSerializer(user).data)


class MyDataView(APIView):
    """
    DELETE /api/auth/me/data/ — deletes every opportunity, email, interview,
    notification and processing record Oppora stored, revokes Gmail access and
    deletes the tokens. Account and preferences remain.
    """

    def delete(self, request):
        g = request.user.gmail
        google.revoke(g.refresh_token or g.access_token)
        with transaction.atomic():
            clear_user_data(request.user)
            g.clear_tokens()
            g.status = GmailConnection.Status.DISCONNECTED
            g.connected_at = None
            g.sync_phase = GmailConnection.Phase.IDLE
            g.sync_started_at = None
            g.sync_emails_in_batch = 0
            g.sync_queued = 0
            g.last_synced_at = None
            g.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PreferencesView(APIView):
    def get(self, request):
        return Response(PreferencesSerializer(request.user.preferences).data)

    def patch(self, request):
        s = PreferencesSerializer(request.user.preferences, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        prefs = s.save()
        if "preferredLocations" in request.data or "personalization" in (request.data.get("ai") or {}):
            from mail.pipeline import rescore

            rescore(request.user, clock.user_now(request))
        return Response(PreferencesSerializer(prefs).data)


class GmailStatusView(APIView):
    def get(self, request):
        return Response(GmailConnectionSerializer(request.user.gmail).data)


class GmailConnectView(APIView):
    """
    POST /api/auth/gmail/connect/ — real accounts get {"redirect": url} to
    Google's consent screen (the frontend navigates there). The seeded demo
    account has no mailbox, so it's simply marked connected.
    """

    def post(self, request):
        g = request.user.gmail
        if not g.is_demo:
            if not settings.GOOGLE_OAUTH_ENABLED:
                return Response(
                    {"error": {"code": "not_configured", "message": "Google sign-in isn't set up yet (see README)."}},
                    status=status.HTTP_409_CONFLICT,
                )
            return Response(
                {"redirect": "/api/auth/google/login?intent=connect&next=" + quote("/settings?gmail=connected#gmail")}
            )
        g.email = request.user.email
        g.status = GmailConnection.Status.CONNECTED
        g.connected_at = clock.now()
        g.scopes = ["gmail.readonly", "openid", "email", "profile"]
        if g.sync_phase == GmailConnection.Phase.ERROR:
            g.sync_phase = GmailConnection.Phase.COMPLETED if g.last_synced_at else GmailConnection.Phase.IDLE
        g.save()
        return Response(GmailConnectionSerializer(g).data)


class GmailDisconnectView(APIView):
    """POST /api/auth/gmail/disconnect/ — revokes the token at Google and deletes the stored tokens."""

    def post(self, request):
        g = request.user.gmail
        google.revoke(g.refresh_token or g.access_token)
        g.clear_tokens()
        g.status = GmailConnection.Status.DISCONNECTED
        g.connected_at = None
        g.save()
        return Response(GmailConnectionSerializer(g).data)


# --- Google sign-in (plain Django views: they redirect the browser) ------------------


def _to_frontend(path: str) -> HttpResponseRedirect:
    return HttpResponseRedirect(f"{settings.FRONTEND_ORIGIN}{path}")


@require_GET
def google_login(request):
    """
    GET /api/auth/google/login/?next=/dashboard&intent=signin|connect — sends the
    browser to Google's consent screen. Without Google credentials (local
    development) it signs in the seeded demo user instead.
    """
    if auth_rate_limited(request):
        return _to_frontend("/?auth_error=rate_limited")
    next_path = google.safe_next(request.GET.get("next"))
    if not settings.GOOGLE_OAUTH_ENABLED:
        if settings.DEV_LOGIN_ENABLED:
            user = User.objects.filter(email=settings.DEMO_USER_EMAIL, is_active=True).first()
            if user:
                login(request, user, backend="django.contrib.auth.backends.ModelBackend")
                return _to_frontend(next_path)
        return _to_frontend("/?auth_error=not_configured")
    intent = "connect" if request.GET.get("intent") == "connect" else "signin"
    hint = request.user.email if request.user.is_authenticated else None
    return HttpResponseRedirect(google.begin(request.session, next_path=next_path, intent=intent, login_hint=hint))


@require_GET
def google_callback(request):
    """GET /api/auth/google/callback/ — Google redirects here after consent."""
    if auth_rate_limited(request):
        return _to_frontend("/?auth_error=rate_limited")
    try:
        info = google.finish(
            request.session, state=request.GET.get("state"), code=request.GET.get("code"), error=request.GET.get("error")
        )
    except google.OAuthError as e:
        log.info("Google sign-in failed: %s (%s)", e.code, e)
        return _to_frontend(f"/?auth_error={e.code}")

    if info["intent"] == "connect" and request.user.is_authenticated and request.user.email != info["email"]:
        google.revoke(info["refresh_token"] or info["access_token"])
        return _to_frontend("/settings?gmail_error=account_mismatch#gmail")

    with transaction.atomic():
        user, created = User.objects.get_or_create(email=info["email"], defaults={"name": info["name"][:80]})
        g = GmailConnection.objects.select_for_update().get(user=user)
        g.google_sub = info["sub"]
        g.email = info["email"]
        g.is_demo = False
        if settings.GMAIL_SCOPE in info["scopes"]:
            g.set_tokens(refresh_token=info["refresh_token"], access_token=info["access_token"], expiry=info["expiry"])
            g.status = GmailConnection.Status.CONNECTED if g.refresh_token else GmailConnection.Status.NEEDS_RECONNECT
            g.connected_at = clock.now()
            if g.sync_phase == GmailConnection.Phase.ERROR:
                g.sync_phase = GmailConnection.Phase.COMPLETED if g.last_synced_at else GmailConnection.Phase.IDLE
        else:
            # Signed in, but the Gmail box was unticked on Google's consent screen.
            g.status = GmailConnection.Status.DISCONNECTED
        g.scopes = [google.short_scope(s) for s in info["scopes"]]
        g.save()

    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    next_path = info["next"]
    if settings.GMAIL_SCOPE not in info["scopes"]:
        next_path = "/settings?gmail_error=scope_missing#gmail"
    elif created and g.status == GmailConnection.Status.CONNECTED:
        from mail.sync import start_sync

        start_sync(user)  # first sign-in: start the initial scan right away
    return _to_frontend(next_path)
