"""
Encryption at rest for OAuth tokens (Fernet: AES-128-CBC + HMAC-SHA256).

The key comes from TOKEN_ENCRYPTION_KEY. Several comma-separated keys are
allowed for rotation: the first encrypts, all of them decrypt.
"""

from functools import cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


@cache
def _fernet() -> MultiFernet:
    keys = [k.strip() for k in settings.TOKEN_ENCRYPTION_KEY.split(",") if k.strip()]
    if not keys:
        raise ImproperlyConfigured(
            "TOKEN_ENCRYPTION_KEY is not set. Run start-oppora.ps1 (it generates one) or see .env.example."
        )
    try:
        return MultiFernet([Fernet(k) for k in keys])
    except ValueError as e:
        raise ImproperlyConfigured("TOKEN_ENCRYPTION_KEY must be a Fernet key (32 url-safe base64 bytes).") from e


def encrypt(value: str | None) -> str:
    return _fernet().encrypt(value.encode()).decode() if value else ""


def decrypt(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return None  # wrong/rotated key: treat as no token, so the user reconnects
