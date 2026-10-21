"""
Rate limits (PROMPT.md §10: auth, sync and assistant endpoints, plus a general cap).

Counters live in the cache named by settings.THROTTLE_CACHE (Redis in
development; an in-memory cache in tests). If the cache is unreachable the
request is allowed and the problem is logged: losing the rate limiter must
not take the whole API down.
"""

import logging

from django.conf import settings
from django.core.cache import caches
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle, SimpleRateThrottle, UserRateThrottle

log = logging.getLogger(__name__)


class _SafeCacheMixin:
    @property
    def cache(self):
        return caches[settings.THROTTLE_CACHE]

    def allow_request(self, request, view):
        try:
            return super().allow_request(request, view)
        except Exception as e:  # cache down: fail open, but say so
            log.warning("Rate limiter unavailable (%s); allowing the request", type(e).__name__)
            return True


class AnonThrottle(_SafeCacheMixin, AnonRateThrottle):
    pass


class UserThrottle(_SafeCacheMixin, UserRateThrottle):
    pass


class ScopedThrottle(_SafeCacheMixin, ScopedRateThrottle):
    """Per-view scope (`throttle_scope`), keyed by user (or IP when signed out)."""


class SyncStartThrottle(_SafeCacheMixin, SimpleRateThrottle):
    """Starting a scan (POST /api/sync/). Polling the status (GET) isn't limited by this."""

    scope = "sync"

    def get_cache_key(self, request, view):
        if request.method != "POST":
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": request.user.pk if request.user.is_authenticated else self.get_ident(request),
        }


class AuthIPThrottle(_SafeCacheMixin, SimpleRateThrottle):
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
