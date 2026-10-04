"""Security headers on every API response (Django's SecurityMiddleware covers nosniff, referrer, HSTS), and the read-only demo."""

from django.conf import settings
from django.http import JsonResponse

API_HEADERS = {
    # Responses carry personal data: never store them in a browser or shared cache.
    "Cache-Control": "no-store",
    # An API response is never a page: no scripts, no framing, nothing loads from it.
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
}


#: Requests the read-only demo may still make: they don't change the sample data.
DEMO_ALLOWED_WRITES = frozenset({"/api/auth/logout/", "/api/assistant/"})
DEMO_READ_ONLY_MESSAGE = (
    "This is a read-only demo, so changes aren't saved. Sign in with Google to use Oppora with your own Gmail."
)


class DemoReadOnlyMiddleware:
    """
    The public demo account is shared by every visitor: refuse anything that
    would change it (saves, applications, settings, scans, deleting data…).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if (
            settings.DEMO_READ_ONLY
            and request.method not in ("GET", "HEAD", "OPTIONS")
            and request.path.startswith("/api/")
            and request.path not in DEMO_ALLOWED_WRITES
        ):
            from core.demo import is_demo_user

            if is_demo_user(request.user):
                return JsonResponse({"error": {"code": "demo_read_only", "message": DEMO_READ_ONLY_MESSAGE}}, status=403)
        return self.get_response(request)


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            for k, v in API_HEADERS.items():
                response.headers.setdefault(k, v)
        return response
