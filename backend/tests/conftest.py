from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIClient

from accounts.models import GmailConnection, User
from ai import client as ai_client
from ai.providers.fake import FakeProvider
from core import clock
from core.seed import export_seed, load_seed
from mail import sync

from .gmail_fakes import FakeGmail

TZ = "Asia/Kolkata"
KOLKATA = ZoneInfo(TZ)
#: The brief's reference day; the seed's offsets reproduce its days-left on any day.
DEMO_NOW = datetime(2026, 10, 2, 9, 30, tzinfo=KOLKATA)

_exports: dict[date, dict] = {}

#: A throwaway Fernet key for tests (never a real secret).
TEST_FERNET_KEY = "0Kc2j3cnUGs6rfvlDhqI2Mw8Xl8m3xqgW8rB1nC9oXs="


@pytest.fixture(autouse=True)
def _test_settings(settings):
    """Jobs run inline, tokens use a test key, and no test can reach a real AI or Google (or see real keys)."""
    from ai import client
    from core.crypto import _fernet

    settings.JOBS_EAGER = True
    settings.TOKEN_ENCRYPTION_KEY = TEST_FERNET_KEY
    # Hermetic: never use the developer's real keys from ../.env.
    settings.GEMINI_API_KEY = ""
    settings.OPENAI_API_KEY = ""
    settings.GOOGLE_CLIENT_ID = ""
    settings.GOOGLE_CLIENT_SECRET = ""
    settings.GOOGLE_OAUTH_ENABLED = False
    settings.DEV_LOGIN_ENABLED = True
    # Rate-limit counters in memory, fresh for every test (no Redis needed).
    settings.THROTTLE_CACHE = "local"
    from django.core.cache import caches

    caches["local"].clear()
    _fernet.cache_clear()
    client.set_provider(None)
    yield
    _fernet.cache_clear()
    client.set_provider(None)


def exported_for(day: date) -> dict:
    """The seed from frontend/lib/mock/seed.ts for `day` (cached per test session)."""
    if day not in _exports:
        _exports[day] = export_seed(day, TZ)
    return _exports[day]


@pytest.fixture
def freeze(monkeypatch):
    """freeze(dt): makes core.clock.now() return `dt` (aware)."""

    def _freeze(dt: datetime):
        monkeypatch.setattr(clock, "now", lambda: dt)
        return dt

    return _freeze


def make_client(user=None) -> APIClient:
    c = APIClient(HTTP_X_TIMEZONE=TZ)
    if user:
        c.force_login(user)
    return c


@pytest.fixture
def seeded(db, freeze):
    """Seeds the demo user for DEMO_NOW; returns (user, seed-id → db-id map)."""
    freeze(DEMO_NOW)
    return load_seed(exported_for(DEMO_NOW.date()))


@pytest.fixture
def user(seeded):
    return seeded[0]


@pytest.fixture
def ids(seeded):
    return seeded[1]


@pytest.fixture
def api(user):
    return make_client(user)


# --- Shared by the pipeline tests (fake clock, fake AI, a Google-connected account, fake Gmail) ---

PIPELINE_NOW = datetime(2026, 10, 2, 9, 30, tzinfo=KOLKATA)


@pytest.fixture
def no_wait(monkeypatch):
    """The rate limiter and backoff use a fake clock: tests never sleep, but waits are recorded."""
    clock = {"t": 1000.0}
    waits: list[float] = []

    def fake_sleep(s):
        waits.append(round(s, 2))
        clock["t"] += s

    monkeypatch.setattr(ai_client, "sleep", fake_sleep)
    monkeypatch.setattr(ai_client, "monotonic", lambda: clock["t"])
    return waits


@pytest.fixture
def fake_ai(no_wait):
    p = FakeProvider()
    ai_client.set_provider(p)
    return p


@pytest.fixture
def real_user(db, freeze):
    """A Google-connected (non-demo) account."""
    freeze(PIPELINE_NOW)
    user = User.objects.create_user("me@gmail.example", name="Rasmitha")
    user.interests = ["frontend development", "software engineering", "hackathons"]
    user.skills = ["React", "TypeScript", "CSS"]
    user.experience_level = "Undergraduate student"
    user.timezone = "Asia/Kolkata"
    user.save()
    user.preferences.ai_mode = "ai"  # answered the consent screen: "Continue" (Gemini)
    user.preferences.save()
    g = user.gmail
    g.status, g.email = GmailConnection.Status.CONNECTED, "me@gmail.example"
    g.set_tokens(refresh_token="1//refresh-secret", access_token="ya29.access", expiry=datetime(2030, 1, 1, tzinfo=UTC))
    g.save()
    return user


@pytest.fixture
def gmail(monkeypatch):
    fake = FakeGmail()
    monkeypatch.setattr(sync.GmailClient, "for_connection", classmethod(lambda cls, g: fake))
    return fake
