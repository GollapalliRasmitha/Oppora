"""
Rate-limited, retrying access to the configured AI provider.

Free-tier limits are respected rather than hit:
- per minute: a sliding-window limiter spaces requests (AI_REQUESTS_PER_MINUTE)
- per day: requests are counted in the database (AIUsage) and stop at
  AI_REQUESTS_PER_DAY; the quota day follows the provider's reset (Pacific time)
- per account (AI_FAIR_SHARE): each connected account gets an equal share of
  the daily budget (AIUserUsage), so one big inbox can't use it all
- a 429 waits (the provider's retryDelay, else exponential backoff) and retries
- if a request still can't go through, the caller leaves the email queued for
  the next sync. A rate limit never fails a sync.
"""

import contextvars
import threading
import time
from collections import deque
from contextlib import contextmanager
from datetime import datetime
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.db.models import F

from .models import AIUsage, AIUserUsage
from .providers.base import AIProvider, DailyLimitReached, NotConfigured, RateLimited, TransientAIError

QUOTA_ZONE = ZoneInfo("America/Los_Angeles")  # Gemini's daily quota resets at midnight Pacific
MAX_ATTEMPTS = 5
BACKOFF = [10, 20, 40, 80, 120]  # seconds
#: After the main model reports overload, use the fallback model for this long before trying it again.
FALLBACK_FOR = 300  # seconds

# Indirection so tests can run without waiting.
sleep = time.sleep
monotonic = time.monotonic


class RateLimiter:
    """At most `per_minute` requests in any 60s window, across all threads of this process."""

    def __init__(self, per_minute: int):
        self.per_minute = max(1, per_minute)
        self._sent: deque[float] = deque()
        self._not_before = 0.0
        self._lock = threading.Lock()

    def acquire(self) -> None:
        with self._lock:  # held while waiting: requests go out one at a time, in order
            while True:
                now = monotonic()
                while self._sent and now - self._sent[0] >= 60:
                    self._sent.popleft()
                wait = max(self._not_before - now, 0)
                if len(self._sent) >= self.per_minute:
                    wait = max(wait, 60 - (now - self._sent[0]))
                if wait <= 0:
                    self._sent.append(now)
                    return
                sleep(wait + 0.05)

    def pause(self, seconds: float) -> None:
        """After a 429: nothing goes out for `seconds`."""
        with self._lock:
            self._not_before = max(self._not_before, monotonic() + seconds)


_provider: AIProvider | None = None
_fallback: AIProvider | None = None
_use_fallback_until = 0.0
_limiter: RateLimiter | None = None
_setup_lock = threading.Lock()


def build_provider() -> AIProvider:
    if settings.AI_PROVIDER == "gemini":
        from .providers.gemini import GeminiProvider

        return GeminiProvider(settings.GEMINI_API_KEY, settings.GEMINI_MODEL)
    if settings.AI_PROVIDER == "openai":
        from .providers.openai import OpenAIProvider

        return OpenAIProvider(settings.OPENAI_API_KEY, settings.OPENAI_MODEL)
    raise NotConfigured(f"Unknown AI_PROVIDER {settings.AI_PROVIDER!r} (use gemini or openai).")


def build_fallback() -> AIProvider | None:
    """A lighter model of the same provider for when the main one is overloaded (Gemini only)."""
    model = settings.GEMINI_FALLBACK_MODEL
    if settings.AI_PROVIDER != "gemini" or not model or model == settings.GEMINI_MODEL:
        return None
    from .providers.gemini import GeminiProvider

    return GeminiProvider(settings.GEMINI_API_KEY, model)


def get_provider() -> AIProvider:
    global _provider, _fallback, _limiter
    with _setup_lock:
        if _provider is None:
            _provider = build_provider()
            _fallback = build_fallback()
        if _limiter is None:
            _limiter = RateLimiter(settings.AI_REQUESTS_PER_MINUTE)
    return _provider


def set_provider(provider: AIProvider | None, per_minute: int | None = None, fallback: AIProvider | None = None) -> None:
    """Swap the provider (tests, or after changing settings). None = rebuild from settings."""
    global _provider, _fallback, _limiter, _use_fallback_until
    with _setup_lock:
        _provider = provider
        _fallback = fallback
        _use_fallback_until = 0.0
        _limiter = RateLimiter(per_minute or settings.AI_REQUESTS_PER_MINUTE)


class ShareUsedUp(DailyLimitReached):
    """This account's fair share of today's AI budget is used up (other accounts may still have some)."""


def next_reset(now: datetime | None = None) -> datetime:
    """When the provider's daily quota (and so the budget) resets: the next midnight Pacific time."""
    from datetime import time, timedelta

    day = quota_day(now) + timedelta(days=1)
    return datetime.combine(day, time(0), tzinfo=QUOTA_ZONE)


#: The account whose email is being processed (set by the sync around its work).
_current_user = contextvars.ContextVar("ai_user_id", default=None)


@contextmanager
def for_user(user_id):
    """Counts the AI requests made inside this block against `user_id`'s fair share."""
    token = _current_user.set(user_id)
    try:
        yield
    finally:
        _current_user.reset(token)


def fair_share() -> int:
    """Each connected (non-demo) account's daily requests: an equal split of AI_REQUESTS_PER_DAY."""
    from accounts.models import GmailConnection

    accounts = GmailConnection.objects.filter(is_demo=False, status=GmailConnection.Status.CONNECTED).count()
    return max(1, settings.AI_REQUESTS_PER_DAY // max(1, accounts))


def user_requests_today(user_id, provider: str) -> int:
    row = AIUserUsage.objects.filter(user_id=user_id, provider=provider, day=quota_day()).first()
    return row.requests if row else 0


def user_budget_left(user_id, provider: str) -> bool:
    """Whether this account may still send requests today (always true without AI_FAIR_SHARE)."""
    if not settings.AI_FAIR_SHARE:
        return True
    return user_requests_today(user_id, provider) < fair_share()


def quota_day(now: datetime | None = None):
    return (now or datetime.now(tz=QUOTA_ZONE)).astimezone(QUOTA_ZONE).date()


def requests_today(provider: str) -> int:
    row = AIUsage.objects.filter(provider=provider, day=quota_day()).first()
    return row.requests if row else 0


def _reserve(provider: str) -> None:
    """Counts one request against today's budget (and the account's fair share), or raises DailyLimitReached."""
    user_id = _current_user.get()
    with transaction.atomic():
        row, _ = AIUsage.objects.select_for_update().get_or_create(provider=provider, day=quota_day())
        if row.requests >= settings.AI_REQUESTS_PER_DAY:
            raise DailyLimitReached(f"Reached AI_REQUESTS_PER_DAY ({settings.AI_REQUESTS_PER_DAY}).")
        if user_id is not None and settings.AI_FAIR_SHARE:
            mine, _ = AIUserUsage.objects.select_for_update().get_or_create(user_id=user_id, provider=provider, day=quota_day())
            share = fair_share()
            if mine.requests >= share:
                raise ShareUsedUp(f"This account's fair share of today's AI budget is used up ({share}).")
            AIUserUsage.objects.filter(pk=mine.pk).update(requests=F("requests") + 1)
        AIUsage.objects.filter(pk=row.pk).update(requests=F("requests") + 1)


def generate_json(system: str, prompt: str, schema: dict) -> tuple[dict, str]:
    """
    One logical request with waiting and retries. Returns (result, model id).
    Raises DailyLimitReached / NotConfigured (stop the queue for now) or
    TransientAIError (leave this email queued) — never RateLimited.

    When the main model reports overload, the retry goes straight to the
    fallback model (same limiter and daily budget), which stays in use for
    FALLBACK_FOR seconds before the main model is tried again.
    """
    global _use_fallback_until
    primary = get_provider()
    for attempt in range(MAX_ATTEMPTS):
        provider = _fallback if _fallback and monotonic() < _use_fallback_until else primary
        _limiter.acquire()
        _reserve(provider.name)
        try:
            return provider.generate_json(system, prompt, schema), provider.model
        except RateLimited as e:
            delay = e.retry_after if e.retry_after is not None else BACKOFF[attempt]
            _limiter.pause(min(delay, 300))
        except TransientAIError as e:
            if e.overloaded and _fallback and provider is primary:
                _use_fallback_until = monotonic() + FALLBACK_FOR
                continue  # retry right away on the fallback model
            sleep(BACKOFF[attempt])
    raise TransientAIError(f"Still rate limited or unavailable after {MAX_ATTEMPTS} attempts.")
