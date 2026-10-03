"""Shared API plumbing: pagination, consistent JSON errors, request helpers."""

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404, JsonResponse
from rest_framework import exceptions, status
from rest_framework.filters import SearchFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework.views import exception_handler as drf_exception_handler


class Pagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class GmailAccessError(exceptions.APIException):
    """Gmail isn't connected (or the token was revoked) — the UI offers Reconnect Gmail."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "gmail_access"
    default_detail = "We couldn't access your Gmail. Reconnect your account to continue."


def _message(detail) -> str:
    if isinstance(detail, list):
        return _message(detail[0]) if detail else ""
    if isinstance(detail, dict):
        return _message(next(iter(detail.values()))) if detail else ""
    return str(detail)


def exception_handler(exc, context):
    """
    Every error has the same shape:
        {"error": {"code": "not_found", "message": "…", "fields": {…}?}}
    """
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()

    response = drf_exception_handler(exc, context)
    if response is None:
        return None  # unexpected error → Django's 500 handler (JSON, see urls.py)

    if isinstance(exc, (exceptions.NotAuthenticated, exceptions.AuthenticationFailed)):
        # Session auth has no WWW-Authenticate challenge, so DRF would say 403.
        response.status_code = status.HTTP_401_UNAUTHORIZED
        code, message = "not_authenticated", "Your session has expired. Sign in again to continue."
    elif isinstance(exc, exceptions.Throttled):
        code = "rate_limited"
        wait = int(exc.wait or 60)
        message = f"Too many requests. Please wait {wait} second{'' if wait == 1 else 's'} and try again."
    elif isinstance(exc, exceptions.ValidationError):
        code, message = "validation_error", _message(exc.detail) or "Some fields are invalid."
    else:
        codes = exc.get_codes() if hasattr(exc, "get_codes") else "error"
        code = codes if isinstance(codes, str) else "error"
        message = _message(exc.detail)

    body = {"code": code, "message": message}
    if isinstance(exc, exceptions.ValidationError) and isinstance(exc.detail, dict):
        body["fields"] = exc.detail
    response.data = {"error": body}
    return response


def json_error(status_code: int, code: str, message: str) -> JsonResponse:
    return JsonResponse({"error": {"code": code, "message": message}}, status=status_code)


class BoundedSearchFilter(SearchFilter):
    """?q= search, capped at MAX_TERMS words of MAX_LENGTH characters (no huge LIKE queries)."""

    MAX_LENGTH = 200
    MAX_TERMS = 8

    def get_search_terms(self, request):
        q = request.query_params.get(self.search_param, "")
        if len(q) > self.MAX_LENGTH:
            raise exceptions.ValidationError({self.search_param: f"Search is limited to {self.MAX_LENGTH} characters."})
        return super().get_search_terms(request)[: self.MAX_TERMS]
