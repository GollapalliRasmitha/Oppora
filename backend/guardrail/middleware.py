"""
Watches every response (it never changes one) and reports trouble to GuardRail:
- suspicious_path: requests for things Oppora doesn't have but attackers look for (/wp-admin, /.env, /.git…)
- rate_limited: any 429 from the API's rate limits (the sign-in redirects report theirs in core/throttling.py)
- permission_denied: a wrong scheduler secret (401 on /api/cron/), or a 403 for a signed-in, non-demo user
  (the shared demo's "read-only" refusals are normal for visitors, so they're not reported)
Reporting only puts an event in a queue (guardrail/client.py): microseconds, never network time.
"""

import logging
import re

from guardrail.client import report

log = logging.getLogger("oppora.guardrail")

# Paths scanners try. Oppora has none of these, so a request for one is never a real visitor.
SUSPICIOUS = re.compile(
    r"^/(wp-admin|wp-login\.php|wp-content|wp-includes|xmlrpc\.php|\.env|\.git|\.aws|\.ssh|\.DS_Store|"
    r"phpmyadmin|pma|cgi-bin|server-status|vendor/phpunit|actuator|boaform|config\.json|"
    r"[^?]*\.(php|asp|aspx|jsp|cgi|bak|sql)$)",
    re.IGNORECASE,
)


class GuardRailMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            self.inspect(request, response.status_code)
        except Exception:  # monitoring must never break a page
            log.exception("GuardRail middleware failed (ignored).")
        return response

    @staticmethod
    def inspect(request, status: int) -> None:
        from core.demo import is_demo_user

        path = request.path
        user = getattr(request, "user", None)
        if SUSPICIOUS.match(path):
            report("suspicious_path", request, status_code=status)
        elif status == 429:
            report("rate_limited", request, status_code=status, meta={"reason": "throttled"})
        elif path.startswith("/api/cron/") and status == 401:
            report("permission_denied", request, status_code=status, meta={"reason": "cron_secret"})
        elif status == 403 and user is not None and user.is_authenticated and not is_demo_user(user):
            report("permission_denied", request, status_code=status)
