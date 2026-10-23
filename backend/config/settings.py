"""
Django settings for the Oppora API.

Every secret and environment-specific value comes from the environment
(`../.env` in local development; see `../.env.example`). Nothing secret is
hard-coded here.
"""

import os
import sys
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
if os.environ.get("RENDER_EXTERNAL_HOSTNAME"):  # Render sets this to the service's own hostname
    ALLOWED_HOSTS.append(os.environ["RENDER_EXTERNAL_HOSTNAME"])
# The browser's origin: the Next.js app that proxies /api/* here (production: the Vercel URL).
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000").rstrip("/")

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
    "guardrail",  # sends security events to GuardRail (monitoring); switched off unless configured
]

MIDDLEWARE = [
    "guardrail.middleware.GuardRailMiddleware",  # first, so it sees every final status (reports only, never changes)
    "django.middleware.security.SecurityMiddleware",
    "core.middleware.SecurityHeadersMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "core.middleware.DemoReadOnlyMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
TEMPLATES: list = []

DATABASES = {
    "default": dj_database_url.parse(
        os.environ.get("DATABASE_URL", "postgres://oppora:oppora@localhost:5432/oppora"),
        conn_max_age=60,
        # Neon's free tier pauses an idle database and drops connections: check before reuse.
        conn_health_checks=True,
    )
}
# Only for `manage.py copy_account`: the database to copy an account into (e.g. Neon), given
# for one command in the terminal, never saved in .env.
if os.environ.get("TARGET_DATABASE_URL"):
    DATABASES["target"] = dj_database_url.parse(os.environ["TARGET_DATABASE_URL"], conn_max_age=0)
elif "pytest" in sys.modules:  # tests/test_copy_account.py copies into a second test database
    DATABASES["target"] = {**DATABASES["default"], "TEST": {"NAME": "test_oppora_copy_target"}}
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
# Extra origins (comma-separated) are only for unusual setups, e.g. a second frontend URL.
CSRF_TRUSTED_ORIGINS = [FRONTEND_ORIGIN, *env_list("CSRF_EXTRA_ORIGINS")]

# --- Security headers + HTTPS (PROMPT.md §10) ---
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
# Production only (behind HTTPS): HSTS, redirect to HTTPS, trust the proxy's X-Forwarded-Proto.
SECURE_HSTS_SECONDS = 0 if DEBUG else int(os.environ.get("SECURE_HSTS_SECONDS", "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
# Browser preload lists are a long-term commitment for a real domain: opt in deliberately.
SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", False)
SECURE_SSL_REDIRECT = not DEBUG and env_bool("SECURE_SSL_REDIRECT", True)
if env_bool("TRUST_X_FORWARDED_PROTO"):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# Every payload Oppora accepts is small JSON; refuse anything bigger.
DATA_UPLOAD_MAX_MEMORY_SIZE = 256 * 1024
DATA_UPLOAD_MAX_NUMBER_FIELDS = 200
# No CORS: the browser only talks to the Next.js origin (same-origin via its /api proxy), so
# Django sends no Access-Control-* headers and browsers block cross-origin reads.

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")


def _cache_url(url: str) -> str:
    """Rate-limit counters go to database 1 of a local Redis. Hosted Redis (Upstash) has only one database."""
    head, _, db = url.rpartition("/")
    return f"{head}/1" if db.isdigit() and "://" in head else url


# --- Cache (rate-limit counters) ---
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": os.environ.get("CACHE_URL") or _cache_url(REDIS_URL),
        "OPTIONS": {"socket_connect_timeout": 2, "socket_timeout": 2},
        "KEY_PREFIX": "oppora",
    },
    "local": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "oppora-local"},
}
THROTTLE_CACHE = os.environ.get("THROTTLE_CACHE", "default")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_PAGINATION_CLASS": "core.api.Pagination",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "core.api.BoundedSearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "SEARCH_PARAM": "q",
    "EXCEPTION_HANDLER": "core.api.exception_handler",
    "DEFAULT_THROTTLE_CLASSES": ["core.throttling.UserThrottle", "core.throttling.AnonThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.environ.get("RATE_ANON", "60/min"),
        # The UI polls /api/sync/ about once a second while a scan runs, so this is generous.
        "user": os.environ.get("RATE_USER", "600/min"),
        "auth": os.environ.get("RATE_AUTH", "20/min"),  # sign-in endpoints, per IP
        "sync": os.environ.get("RATE_SYNC", "20/hour"),  # starting a scan
        "assistant": os.environ.get("RATE_ASSISTANT", "20/min"),
    },
    # How far from the end of X-Forwarded-For the visitor is, for requests that don't come through our website
    # (core/client_ip.py). Local: 1 (the Next.js dev server). Render: 3 (visitor, Cloudflare, Render's relay;
    # measured 23 Oct 2026). Website requests carry the visitor's IP with PROXY_SECRET instead.
    "NUM_PROXIES": int(os.environ.get("NUM_PROXIES", "1")),
}
# Shared with the website (Vercel): proves the X-Oppora-Client-IP header came from our own proxy. Empty = not trusted.
PROXY_SECRET = os.environ.get("PROXY_SECRET", "").strip()

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
DEMO_USER_EMAIL = os.environ.get("DEMO_USER_EMAIL", "alex@example.com").strip().lower()
# The landing page's "Try the demo": anyone can open the demo account, read-only (core.demo).
PUBLIC_DEMO_ENABLED = env_bool("PUBLIC_DEMO_ENABLED", True)
# Refuse every change made in the demo account. On in production; off in local development,
# where the demo account doubles as the test account (seed_demo resets it).
DEMO_READ_ONLY = env_bool("DEMO_READ_ONLY", not DEBUG)

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
# Split the daily budget equally between connected accounts, so one big inbox can't use it all.
AI_FAIR_SHARE = env_bool("AI_FAIR_SHARE", True)
#: Characters of cleaned email text sent to the AI (subject + sender + trimmed body; never attachments).
AI_MAX_BODY_CHARS = int(os.environ.get("AI_MAX_BODY_CHARS", "4000"))

# --- Background jobs (Stage 9: Celery + Redis) ---
# "celery" (default): syncs run in the Celery worker. "thread": in the web process (no worker
# needed; restarts interrupt them). Tests set JOBS_EAGER=True to run jobs inline.
JOBS_BACKEND = os.environ.get("JOBS_BACKEND", "celery").strip().lower()
JOBS_EAGER = env_bool("JOBS_EAGER", False)
# Time box for one sync run, in seconds (0 = until the queue is empty). Hosting that sleeps
# when idle (Render free) uses short batches: progress is saved after every email, and the
# next Scan or scheduler call continues where this one stopped.
SYNC_BATCH_SECONDS = int(os.environ.get("SYNC_BATCH_SECONDS", "0"))

# --- Scheduler endpoint (POST /api/cron/), for hosting without Celery Beat ---
# A free external scheduler (GitHub Actions) calls it hourly with this secret as a Bearer
# token. Unset = the endpoint doesn't exist. At least 32 characters.
CRON_SECRET = os.environ.get("CRON_SECRET", "").strip()
# Total time box for one scheduler call's email processing (shared fairly between accounts).
CRON_BATCH_SECONDS = int(os.environ.get("CRON_BATCH_SECONDS", "600"))

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
    # Mondays 08:00 in each user's zone (checked hourly), only when "Weekly AI digest" is on.
    "weekly-digest": {"task": "notifications.tasks.weekly_digest", "schedule": crontab(minute=9)},
    # Security events GuardRail couldn't take earlier (it was down): send them again.
    "guardrail-outbox": {"task": "guardrail.tasks.flush_outbox", "schedule": crontab(minute="*/10")},
}

# --- GuardRail (security monitoring, guardrail/client.py) ---
# Events are sent in the background with a 2 s timeout; failures wait in an outbox and never affect visitors.
# Off unless all three are set. GUARDRAIL_SECRET = the same value as INGEST_SECRET_OPPORA in GuardRail.
GUARDRAIL_ENABLED = env_bool("GUARDRAIL_ENABLED")
GUARDRAIL_URL = os.environ.get("GUARDRAIL_URL", "").strip()
GUARDRAIL_SECRET = os.environ.get("GUARDRAIL_SECRET", "").strip()
GUARDRAIL_SYNC = False  # tests only: send inline instead of in the background thread
REMINDER_LOCAL_HOUR = 9  # reminders the day before a deadline, 09:00 in the user's zone
BRIEFING_LOCAL_HOUR = 8
DIGEST_LOCAL_HOUR = 8  # Mondays

# --- Production safety: refuse to start with missing or weak secrets ---
if not DEBUG:
    _problems = []
    if len(SECRET_KEY) < 50 or SECRET_KEY.startswith("django-insecure"):
        _problems.append("DJANGO_SECRET_KEY must be a random value of at least 50 characters")
    if not TOKEN_ENCRYPTION_KEY:
        _problems.append("TOKEN_ENCRYPTION_KEY is required (it encrypts Gmail tokens)")
    if not os.environ.get("DATABASE_URL"):
        _problems.append("DATABASE_URL is required")
    if CRON_SECRET and len(CRON_SECRET) < 32:
        _problems.append("CRON_SECRET must be at least 32 characters")
    if not FRONTEND_ORIGIN.startswith("https://"):
        _problems.append("FRONTEND_ORIGIN must be the https:// address of the frontend")
    if _problems:
        raise ImproperlyConfigured("Production settings: " + "; ".join(_problems) + ".")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO" if DEBUG else "WARNING")},
}
