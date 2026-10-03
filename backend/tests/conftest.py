from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIClient

from core import clock
from core.seed import export_seed, load_seed

TZ = "Asia/Kolkata"
KOLKATA = ZoneInfo(TZ)
#: The brief's reference day; the seed's offsets reproduce its days-left on any day.
DEMO_NOW = datetime(2026, 10, 2, 9, 30, tzinfo=KOLKATA)

_exports: dict[date, dict] = {}


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
