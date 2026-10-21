"""Rate limits hold under parallel requests (finding from GuardRail's attack simulator, 21 Oct 2026).

DRF's SimpleRateThrottle read the request history and wrote it back in two steps, so requests arriving at the
same moment all saw the old history and all passed (75 sign-ins sent 8 at a time: 70 got through a 20/min limit).
These tests fire requests from many threads at once, with a cache that answers slowly (as a network cache does),
and check that no more than the limit get through.
"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from django.core.cache import caches
from django.test import RequestFactory
from rest_framework.request import Request
from rest_framework.throttling import SimpleRateThrottle

from core.throttling import AuthIPThrottle, ScopedThrottle, auth_rate_limited


@pytest.fixture
def rates(monkeypatch):
    def set_rates(**r):
        base = {"anon": "1000/min", "user": "1000/min", "auth": "1000/min", "sync": "1000/hour", "assistant": "1000/min"}
        monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {**base, **r})

    return set_rates


@pytest.fixture
def slow_cache(monkeypatch):
    """Every cache call takes 2 ms, like a round trip to Redis, so overlapping requests really overlap.

    Django gives each thread its own cache object (sharing one store), so the class is patched, not an instance.
    """
    cls = type(caches["local"])
    for name in ("get", "set", "add", "incr"):
        original = getattr(cls, name)

        def slow(*a, _original=original, **k):
            time.sleep(0.002)
            return _original(*a, **k)

        monkeypatch.setattr(cls, name, slow)


def _parallel(fn, total, workers=8):
    start = threading.Barrier(workers)

    def first(i):
        if i < workers:
            start.wait()  # the first wave starts at exactly the same moment
        return fn(i)

    with ThreadPoolExecutor(workers) as pool:
        return list(pool.map(first, range(total)))


def test_parallel_sign_ins_cannot_exceed_the_limit(rates, slow_cache):
    rates(auth="20/min")
    rf = RequestFactory()

    def sign_in(_):
        return auth_rate_limited(rf.get("/api/auth/google/login/", REMOTE_ADDR="127.0.0.1", HTTP_X_FORWARDED_FOR="192.0.2.250"))

    results = _parallel(sign_in, 75)
    allowed = sum(r is None for r in results)
    assert allowed == 20, f"{allowed} of 75 parallel sign-ins passed a 20/min limit"
    assert all(1 <= r <= 60 for r in results if r is not None)  # blocked ones are told how long to wait


def test_parallel_requests_from_one_user_cannot_exceed_a_scoped_limit(rates, slow_cache, user):
    rates(assistant="5/min")
    rf = RequestFactory()
    view = type("View", (), {"throttle_scope": "assistant"})()

    def ask(_):
        req = Request(rf.post("/api/assistant/"))
        req.user = user
        return ScopedThrottle().allow_request(req, view)

    assert sum(_parallel(ask, 40)) == 5


def test_limits_are_per_client_and_the_window_resets(rates, monkeypatch):
    rates(auth="2/min")
    now = [60 * 16_667 + 20.0]  # 20 s into a minute
    monkeypatch.setattr(AuthIPThrottle, "timer", lambda self: now[0])
    rf = RequestFactory()

    def attempt(ip):
        return auth_rate_limited(rf.get("/", REMOTE_ADDR="127.0.0.1", HTTP_X_FORWARDED_FOR=ip))

    assert [attempt("203.0.113.1") for _ in range(3)] == [None, None, 40]  # wait = rest of the minute
    assert attempt("203.0.113.2") is None  # another client has its own count
    now[0] += 40  # next minute
    assert attempt("203.0.113.1") is None
