"""
The visitor's real IP, for the per-visitor rate limits and GuardRail's security events (one function, so they agree).

Two ways a request reaches Django in production (measured on the live site, 23 Oct 2026):
- Through the website (browser → Vercel → Cloudflare → Render): Django can't count back to the visitor, because Vercel
  adds a step. So the website's proxy.ts passes the visitor's IP in X-Oppora-Client-IP together with
  X-Oppora-Proxy-Secret = PROXY_SECRET (the same value on Vercel and Render). Django trusts the header ONLY when the
  secret matches: anyone can send headers straight to Django, but they don't know the secret.
- Straight to Render (scanners, scripts): X-Forwarded-For ends "…, visitor, Cloudflare, Render's relay". Cloudflare
  writes the visitor's address itself, after anything the visitor sent, so counting NUM_PROXIES=3 from the end can't
  be fooled. That's DRF's own get_ident.
Locally there's no secret and NUM_PROXIES=1 (the Next.js dev server), as before.
"""

import hmac
import ipaddress

from django.conf import settings


def _from_our_website(request) -> bool:
    """True only if the request carries the right PROXY_SECRET (constant-time compare)."""
    secret = getattr(settings, "PROXY_SECRET", "")
    sent = request.META.get("HTTP_X_OPPORA_PROXY_SECRET", "")
    return bool(secret) and bool(sent) and hmac.compare_digest(sent, secret)


def client_ip(request) -> str:
    if _from_our_website(request):
        claimed = request.META.get("HTTP_X_OPPORA_CLIENT_IP", "").strip()
        try:
            return str(ipaddress.ip_address(claimed))
        except ValueError:
            pass  # a broken header from our own proxy: fall back to the connection's chain
    from rest_framework.throttling import BaseThrottle

    return BaseThrottle().get_ident(request)  # X-Forwarded-For counted from the end (NUM_PROXIES)
