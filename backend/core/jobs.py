"""
Background work, so API requests never wait for Gmail or the AI.

Stage 8 runs each job in a daemon thread of the web process. Stage 9 swaps
this for Celery workers, with the same call sites. The queue itself lives in
the database (ProcessedMessage), so a restart loses no work: the next sync
picks up whatever is still queued. Tests set JOBS_EAGER=True to run jobs inline.
"""

import logging
import threading

from django.conf import settings
from django.db import connections

log = logging.getLogger(__name__)


def enqueue(fn, *args, **kwargs) -> None:
    if settings.JOBS_EAGER:
        fn(*args, **kwargs)
        return

    def run():
        try:
            fn(*args, **kwargs)
        except Exception:
            log.exception("Background job %s failed", getattr(fn, "__name__", fn))
        finally:
            connections.close_all()

    threading.Thread(target=run, name=f"job-{getattr(fn, '__name__', 'task')}", daemon=True).start()
