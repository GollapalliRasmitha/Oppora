"""
Google OAuth 2.0 authorization-code flow with PKCE (PROMPT.md §6: Django owns
OAuth, with offline access, because the sync needs the refresh token).

Scopes are only openid + email + profile + gmail.readonly. The `state` value
and PKCE verifier live in the user's session, so a callback can't be replayed
or forged into someone else's browser (login CSRF).
"""

import base64
import hashlib
import secrets
import time
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import requests
from django.conf import settings
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token

AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
REVOKE_URI = "https://oauth2.googleapis.com/revoke"
SESSION_KEY = "google_oauth"
#: How long a started sign-in stays valid.
STATE_TTL = 600


#: Sign-in errors that are normal user behaviour, not attacks (GuardRail isn't told about them).
HARMLESS_ERRORS = frozenset({"access_denied", "expired"})


class OAuthError(Exception):
    """`code` becomes ?auth_error=<code> on the landing page."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(detail or code)
        self.code = code


def safe_next(value: str | None, default: str = "/dashboard") -> str:
    """Only same-site relative paths (no //host, no backslashes, no schemes)."""
    if not value or not value.startswith("/") or value.startswith("//") or "\\" in value or len(value) > 200:
        return default
    return value


def begin(session, *, next_path: str, intent: str, login_hint: str | None = None) -> str:
    """Stores state + PKCE verifier in the session and returns Google's consent URL."""
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    session[SESSION_KEY] = {"state": state, "verifier": verifier, "next": next_path, "intent": intent, "at": time.time()}
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(settings.GOOGLE_SCOPES),
        "access_type": "offline",  # a refresh token, so the sync can run without the user
        "prompt": "consent",  # Google only returns a refresh token on consent
        "include_granted_scopes": "false",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    if login_hint:
        params["login_hint"] = login_hint
    return f"{AUTH_URI}?{urlencode(params)}"


def finish(session, *, state: str | None, code: str | None, error: str | None) -> dict:
    """
    Validates the callback and exchanges the code. Returns
    {email, name, sub, refresh_token, access_token, expiry, scopes, next, intent}.
    """
    pending = session.pop(SESSION_KEY, None)
    if error:
        raise OAuthError("access_denied" if error == "access_denied" else "google_error", error)
    if not pending or not state or not secrets.compare_digest(str(pending.get("state")), state):
        raise OAuthError("state_mismatch")
    if time.time() - pending.get("at", 0) > STATE_TTL:
        raise OAuthError("expired")
    if not code:
        raise OAuthError("no_code")

    try:
        r = requests.post(
            TOKEN_URI,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
                "code_verifier": pending["verifier"],
            },
            timeout=15,
        )
    except requests.RequestException as e:
        raise OAuthError("token_exchange_failed", type(e).__name__) from e
    if r.status_code != 200:
        raise OAuthError("token_exchange_failed", r.text[:200])
    tokens = r.json()

    try:
        claims = id_token.verify_oauth2_token(tokens.get("id_token"), GoogleRequest(), settings.GOOGLE_CLIENT_ID)
    except (ValueError, TypeError) as e:
        raise OAuthError("invalid_id_token", str(e)) from e
    if not claims.get("email") or not claims.get("email_verified"):
        raise OAuthError("email_unverified")

    expires_in = int(tokens.get("expires_in") or 3600)
    return {
        "email": claims["email"].lower(),
        "name": claims.get("given_name") or claims.get("name") or claims["email"].split("@")[0],
        "sub": claims["sub"],
        "refresh_token": tokens.get("refresh_token"),
        "access_token": tokens.get("access_token"),
        "expiry": datetime.now(tz=UTC) + timedelta(seconds=expires_in - 60),
        "scopes": (tokens.get("scope") or "").split(),
        "next": pending.get("next") or "/dashboard",
        "intent": pending.get("intent") or "signin",
    }


def revoke(token: str | None) -> None:
    """Best effort: the stored tokens are deleted either way."""
    if not token:
        return
    try:
        requests.post(REVOKE_URI, data={"token": token}, timeout=10)
    except requests.RequestException:
        pass


def short_scope(scope: str) -> str:
    """'https://www.googleapis.com/auth/gmail.readonly' → 'gmail.readonly' (what the UI lists)."""
    return {
        "https://www.googleapis.com/auth/userinfo.email": "email",
        "https://www.googleapis.com/auth/userinfo.profile": "profile",
    }.get(scope, scope.rsplit("/", 1)[-1])
