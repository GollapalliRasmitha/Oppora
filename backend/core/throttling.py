"""
Rate limits (PROMPT.md §10: auth, sync and assistant endpoints, plus a general cap).

Counters live in the cache named by settings.THROTTLE_CACHE (Redis in
development; an in-memory cache in tests). If the cache is unreachable the
request is allowed and the problem is logged: losing the rate limiter must
not take the whole API down.

Counting is a fixed window with one atomic increment per request (cache `add`
creates the window's counter with an expiry, `incr` adds one and returns the
new total; Redis INCR is atomic, locmem holds a lock). DRF's own
SimpleRateThrottle reads a history list and writes it back in two steps, so
requests arriving together all saw the old list and all passed (GuardRail's
attack simulator, 21 Oct 2026: 70 of 75 parallel sign-ins through a 20/min
limit). A fixed window can let up to twice the limit through around a window
boundary; that's the usual trade for an atomic counter.
"""

import logging
import math

from django.conf import settings
from django.core.cache import caches
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, SimpleRateThrottle, UserRateThrottle

log = logging.getLogger(__name__)


class AtomicRateThrottle(SimpleRateThrottle):
    """SimpleRateThrottle's rates, keys and wait(), counted with an atomic increment.

    Listed after DRF's throttle class in each subclass's bases, so DRF's own
    get_cache_key / scope handling runs first and then reaches this allow_request.
    """

    @property
    def cache(self):
        return caches[settings.THROTTLE_CACHE]

    def allow_request(self, request, view):
        if self.rate is None:
            return True
        self.key = self.get_cache_key(request, view)
        if self.key is None:
            return True
        self.now = self.timer()
        window = int(self.now // self.duration)
        self.window_end = (window + 1) * self.duration
        try:
            count = self._increment(f"{self.key}:{window}")
        except Exception as e:  # cache down: fail open, but say so
            log.warning("Rate limiter unavailable (%s); allowing the request", type(e).__name__)
            return True
        return count <= self.num_requests

    def _increment(self, key):
        timeout = self.duration + 1  # the counter outlives its window, then expires by itself
        for _ in range(2):
            self.cache.add(key, 0, timeout)  # no-op when another request created it first
            try:
                return self.cache.incr(key)
            except ValueError:  # expired between add and incr: create it again
                continue
        raise RuntimeError("rate-limit counter kept disappearing")

    def wait(self):
        """Seconds until this window ends (Retry-After)."""
        return max(1, math.ceil(self.window_end - self.now))


class AnonThrottle(AnonRateThrottle, AtomicRateThrottle):
    pass


class UserThrottle(UserRateThrottle, AtomicRateThrottle):
    pass


class ScopedThrottle(ScopedRateThrottle, AtomicRateThrottle):
    """Per-view scope (`throttle_scope`), keyed by user (or IP when signed out)."""


class SyncStartThrottle(AtomicRateThrottle):
    """Starting a scan (POST /api/sync/). Polling the status (GET) isn't limited by this."""

    scope = "sync"

    def get_cache_key(self, request, view):
        if request.method != "POST":
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": request.user.pk if request.user.is_authenticated else self.get_ident(request),
        }


class AuthIPThrottle(AtomicRateThrottle):
    """Sign-in endpoints, per client IP (the Next.js proxy forwards it; REST_FRAMEWORK NUM_PROXIES)."""

    scope = "auth"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


def auth_rate_limited(request) -> int | None:
    """For plain Django views (Google sign-in redirects): seconds to wait, or None when allowed."""
    from rest_framework.request import Request

    t = AuthIPThrottle()
    if t.allow_request(Request(request), None):
        return None
    from guardrail.client import report

    report("rate_limited", request, status_code=429, meta={"reason": "sign_in"})
    return int(t.wait() or 60)
