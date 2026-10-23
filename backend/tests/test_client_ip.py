"""
Who is the visitor? (core/client_ip.py) — the IP behind rate limits and GuardRail's security events.

Measured on the live site (23 Oct 2026) with fake documentation addresses in X-Forwarded-For:
- straight to Render, the list ends "…, visitor, Cloudflare, Render's relay", so the visitor is 3rd from the end
  (NUM_PROXIES=3), and anything the visitor writes at the front is ignored;
- through the website, Vercel adds one more step, so a fixed position can't be right for both. The website therefore
  passes the visitor's IP itself, with PROXY_SECRET (like HomeHaat), and Django trusts it only with the secret.
"""

import pytest
from django.test import RequestFactory, override_settings
from rest_framework.test import APIClient

from core.client_ip import client_ip

from .test_security import rates  # noqa: F401  (the tight-limits fixture)

SECRET = "test-proxy-secret-0123456789abcdef0123456789"
RENDER_CHAIN = "192.0.2.1, 192.0.2.2, 203.0.113.50, 172.69.131.168, 10.20.30.40"  # fakes, visitor, Cloudflare, relay


@pytest.fixture
def three_hops(settings):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 3}
    from rest_framework import settings as drf_settings

    drf_settings.api_settings.reload()
    yield
    drf_settings.api_settings.reload()


def make(**meta):
    return RequestFactory().get("/api/health/", REMOTE_ADDR="10.20.30.99", **meta)


@override_settings(PROXY_SECRET=SECRET)
def test_the_website_header_is_trusted_only_with_the_right_secret():
    ok = make(HTTP_X_OPPORA_CLIENT_IP="198.51.100.23", HTTP_X_OPPORA_PROXY_SECRET=SECRET)
    assert client_ip(ok) == "198.51.100.23"
    wrong = make(HTTP_X_OPPORA_CLIENT_IP="198.51.100.23", HTTP_X_OPPORA_PROXY_SECRET="guessed")
    assert client_ip(wrong) == "10.20.30.99"  # a faked header changes nothing
    no_secret_sent = make(HTTP_X_OPPORA_CLIENT_IP="198.51.100.23")
    assert client_ip(no_secret_sent) == "10.20.30.99"


@override_settings(PROXY_SECRET="")
def test_without_a_configured_secret_nothing_is_trusted():
    request = make(HTTP_X_OPPORA_CLIENT_IP="198.51.100.23", HTTP_X_OPPORA_PROXY_SECRET="")
    assert client_ip(request) == "10.20.30.99"


@override_settings(PROXY_SECRET=SECRET)
def test_a_malformed_website_ip_falls_back():
    request = make(HTTP_X_OPPORA_CLIENT_IP="not-an-ip", HTTP_X_OPPORA_PROXY_SECRET=SECRET)
    assert client_ip(request) == "10.20.30.99"


def test_straight_to_render_the_visitor_is_third_from_the_end(three_hops):
    assert client_ip(make(HTTP_X_FORWARDED_FOR=RENDER_CHAIN)) == "203.0.113.50"


@override_settings(PROXY_SECRET=SECRET)
def test_sign_in_limits_count_each_website_visitor_separately(user, rates):  # noqa: F811
    """Before the fix every visitor looked like Cloudflare, so they shared one sign-in counter."""
    rates(auth="2/min")

    def visitor(ip):
        return APIClient(
            REMOTE_ADDR="10.20.30.99",
            HTTP_X_FORWARDED_FOR="172.69.131.168",  # the same Cloudflare edge for everyone
            HTTP_X_OPPORA_CLIENT_IP=ip,
            HTTP_X_OPPORA_PROXY_SECRET=SECRET,
        )

    a, b = visitor("198.51.100.1"), visitor("198.51.100.2")
    assert [a.get("/api/auth/google/login/")["Location"].endswith("rate_limited") for _ in range(3)] == [
        False,
        False,
        True,
    ]
    assert not b.get("/api/auth/google/login/")["Location"].endswith("rate_limited")  # B has its own counter


@override_settings(PROXY_SECRET=SECRET)
def test_guardrail_events_use_the_same_visitor_ip():
    from guardrail.client import client_ip as guardrail_ip

    request = make(HTTP_X_OPPORA_CLIENT_IP="198.51.100.23", HTTP_X_OPPORA_PROXY_SECRET=SECRET)
    assert guardrail_ip(request) == "198.51.100.23"
