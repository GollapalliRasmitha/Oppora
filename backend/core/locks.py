"""
"Is a sync running for this user?" across processes (web server + Celery worker).

Redis key with a TTL that the running job refreshes after every email, so a
worker that dies without cleaning up releases the lock by itself. Tests and
JOBS_BACKEND=thread use an in-process set instead.
"""

import logging
import threading
from functools import cache

from django.conf import settings

log = logging.getLogger(__name__)

TTL = 20 * 60  # seconds; refreshed after every email, longer than the slowest one (AI retries)


class LocalLocks:
    def __init__(self):
        self._held: set[str] = set()
        self._lock = threading.Lock()

    def acquire(self, key: str) -> bool:
        with self._lock:
            if key in self._held:
                return False
            self._held.add(key)
            return True

    def refresh(self, key: str) -> None:
        pass

    def release(self, key: str) -> None:
        with self._lock:
            self._held.discard(key)

    def held(self, key: str) -> bool:
        with self._lock:
            return key in self._held


class RedisLocks:
    def __init__(self, url: str):
        import redis

        self._r = redis.Redis.from_url(url, socket_timeout=5, socket_connect_timeout=5)

    def acquire(self, key: str) -> bool:
        return bool(self._r.set(f"oppora:lock:{key}", "1", nx=True, ex=TTL))

    def refresh(self, key: str) -> None:
        self._r.expire(f"oppora:lock:{key}", TTL)

    def release(self, key: str) -> None:
        self._r.delete(f"oppora:lock:{key}")

    def held(self, key: str) -> bool:
        return bool(self._r.exists(f"oppora:lock:{key}"))


_local = LocalLocks()


@cache
def _redis() -> RedisLocks:
    return RedisLocks(settings.REDIS_URL)


def locks():
    if settings.JOBS_EAGER or settings.JOBS_BACKEND != "celery":
        return _local
    return _redis()
