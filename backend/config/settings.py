"""
Django settings for the Oppora API.

Every secret and environment-specific value comes from the environment
(`../.env` in local development; see `../.env.example`). Nothing secret is
hard-coded here.
"""

import os
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import dotenv_values

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BASE_DIR.parent
ENV_FILE = REPO_DIR / ".env"
#: Names of variables that came from .env (not from the real environment).
_FROM_DOTENV = "_OPPORA_DOTENV_KEYS"


def load_env_file(path: Path = ENV_FILE) -> None:
    """
    Loads ../.env on every start, including runserver's auto-reloads.

    Real environment variables win. Values that an earlier load took from .env
    are re-read, though: runserver's reloader process passes its environment
    to every reloaded copy, so plain load_dotenv() would keep the values from
    the first start forever (e.g. empty Google keys after you fill them in).
    """
    previous = set(filter(None, os.environ.get(_FROM_DOTENV, "").split(",")))
    loaded = []
    for key, value in dotenv_values(path).items():
        if value is None:
            continue
        if key in previous or key not in os.environ:
            os.environ[key] = value
            loaded.append(key)
    for key in previous - set(loaded):
        os.environ.pop(key, None)  # removed from .env since the last load
    os.environ[_FROM_DOTENV] = ",".join(loaded)


load_env_file()


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [v.strip() for v in os.environ.get(name, default).split(",") if v.strip()]


DEBUG = env_bool("DJANGO_DEBUG")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY or (not DEBUG and SECRET_KEY == "change-me"):
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY in the environment (see .env.example).")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "rest_framework",
    "django_filters",
    "core",
    "accounts",
    "mail",
    "opportunities",
    "notifications",
    "ai",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
TEMPLATES: list = []

DATABASES = {
    "default": dj_database_url.parse(
        os.environ.get("DATABASE_URL", "postgres://oppora:oppora@localhost:5432/oppora"),
        conn_max_age=60,
    )
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-gb"
# Stored timestamps are UTC; "today" is computed in the user's zone (core.clock).
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True
DEFAULT_USER_TIMEZONE = os.environ.get("DEFAULT_USER_TIMEZONE", "Asia/Kolkata")

# --- Sessions + CSRF (PROMPT.md §6: secure, httpOnly, SameSite cookie) ---
# The browser only ever talks to the Next.js origin, which proxies /api/* to
# Django, so both cookies are first-party.
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_AGE = 60 * 60 * 24 * 14
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = not DEBUG
CSRF_TRUSTED_ORIGINS = [FRONTEND_ORIGIN]

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "same-origin"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_PAGINATION_CLASS": "core.api.Pagination",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "SEARCH_PARAM": "q",
    "EXCEPTION_HANDLER": "core.api.exception_handler",
}

# --- Google sign-in + Gmail (Stage 8) ---
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
# Through the Next.js origin, so the session cookie it sets is first-party.
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", f"{FRONTEND_ORIGIN}/api/auth/google/callback")
GOOGLE_OAUTH_ENABLED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
# Minimum scopes: read-only Gmail + basic profile and email. Never more.
GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    GMAIL_SCOPE,
]
GMAIL_INITIAL_SYNC_DAYS = int(os.environ.get("GMAIL_INITIAL_SYNC_DAYS", "60"))
#: Upper bound on messages looked at in one scan (the AI's daily limit is the real cap).
GMAIL_MAX_MESSAGES_PER_SYNC = int(os.environ.get("GMAIL_MAX_MESSAGES_PER_SYNC", "500"))

# Fernet key that encrypts OAuth tokens at rest (start-oppora.ps1 generates one).
TOKEN_ENCRYPTION_KEY = os.environ.get("TOKEN_ENCRYPTION_KEY", "").strip()

# Local development without Google credentials: sign in as the seeded demo user.
# Off as soon as Google sign-in is configured, and never without DEBUG.
DEV_LOGIN_ENABLED = DEBUG and env_bool("DJANGO_DEV_LOGIN", True) and not GOOGLE_OAUTH_ENABLED
DEMO_USER_EMAIL = os.environ.get("DEMO_USER_EMAIL", "rasmitha@example.com")

# --- AI pipeline (Stage 8) ---
# One interface (ai.providers); switch providers with AI_PROVIDER=gemini|openai.
AI_PROVIDER = os.environ.get("AI_PROVIDER", "gemini").strip().lower()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash").strip()
# Used when the main model reports overload (503 "high demand"); also free tier. Empty = no fallback.
GEMINI_FALLBACK_MODEL = os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite").strip()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "").strip()
# Free-tier limits (check yours at https://aistudio.google.com/rate-limit). The
# pipeline waits and retries instead of failing when it gets close to them.
AI_REQUESTS_PER_MINUTE = int(os.environ.get("AI_REQUESTS_PER_MINUTE", "9"))
AI_REQUESTS_PER_DAY = int(os.environ.get("AI_REQUESTS_PER_DAY", "200"))
#: Characters of cleaned email text sent to the AI (subject + sender + trimmed body; never attachments).
AI_MAX_BODY_CHARS = int(os.environ.get("AI_MAX_BODY_CHARS", "4000"))

# --- Background jobs (Stage 9: Celery + Redis) ---
# "celery" (default): syncs run in the Celery worker. "thread": in the web process (no worker
# needed; restarts interrupt them). Tests set JOBS_EAGER=True to run jobs inline.
JOBS_BACKEND = os.environ.get("JOBS_BACKEND", "celery").strip().lower()
JOBS_EAGER = env_bool("JOBS_EAGER", False)
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

from celery.schedules import crontab  # noqa: E402

CELERY_BROKER_URL = REDIS_URL
CELERY_TASK_IGNORE_RESULT = True
CELERY_TASK_ACKS_LATE = True  # a task the worker dies on is delivered again
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_BROKER_TRANSPORT_OPTIONS = {"visibility_timeout": 4 * 3600}  # longer than the longest sync
CELERY_TIMEZONE = "UTC"
CELERY_BEAT_SCHEDULE = {
    # Queued emails (e.g. after the AI's daily limit) and interrupted syncs pick up again by
    # themselves: this sees a new quota day within 10 minutes of the reset.
    "resume-queued-emails": {"task": "mail.tasks.resume_queued", "schedule": crontab(minute="*/10")},
    # New mail for every connected account (incremental: Gmail history since the last scan).
    "sync-all-accounts": {"task": "mail.tasks.sync_all", "schedule": crontab(minute="5,35")},
    # Reminders and the daily briefing, at the right local hour for each user.
    "deadline-reminders": {"task": "notifications.tasks.deadline_reminders", "schedule": crontab(minute=2)},
    "daily-briefing": {"task": "notifications.tasks.daily_briefing", "schedule": crontab(minute=7)},
}
REMINDER_LOCAL_HOUR = 9  # reminders the day before a deadline, 09:00 in the user's zone
BRIEFING_LOCAL_HOUR = 8

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO" if DEBUG else "WARNING"},
}
