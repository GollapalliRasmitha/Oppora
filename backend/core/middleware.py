"""Security headers on every API response (Django's SecurityMiddleware covers nosniff, referrer, HSTS)."""

API_HEADERS = {
    # Responses carry personal data: never store them in a browser or shared cache.
    "Cache-Control": "no-store",
    # An API response is never a page: no scripts, no framing, nothing loads from it.
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
}


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            for k, v in API_HEADERS.items():
                response.headers.setdefault(k, v)
        return response
