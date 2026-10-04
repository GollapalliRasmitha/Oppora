"""
Background work, so API requests never wait for Gmail or the AI.

JOBS_BACKEND=celery (default): jobs go to Redis and run in the Celery worker
(`core.tasks.run_job`). If Redis can't be reached, the job runs in a thread of
this process instead (logged), so a missing worker never loses a click.
JOBS_BACKEND=thread runs every job in a thread. Tests set JOBS_EAGER=True to
run jobs inline. Either way the work queue lives in the database
(ProcessedMessage), so nothing is lost on a restart.
"""

import logging
import threading

from django.conf import settings
from django.db import connections

log = logging.getLogger(__name__)


def _path(fn) -> str:
    return f"{fn.__module__}.{fn.__qualname__}"


def _in_thread(fn, args, kwargs) -> None:
    def run():
        try:
            fn(*args, **kwargs)
        except Exception:
            log.exception("Background job %s failed", _path(fn))
        finally:
            connections.close_all()

    threading.Thread(target=run, name=f"job-{fn.__name__}", daemon=True).start()


def in_background(fn, *args, **kwargs) -> None:
    """Always a thread of this process (the scheduler endpoint answers at once and works afterwards)."""
    if settings.JOBS_EAGER:
        fn(*args, **kwargs)
        return
    _in_thread(fn, args, kwargs)


def enqueue(fn, *args, **kwargs) -> None:
    if settings.JOBS_EAGER:
        fn(*args, **kwargs)
        return
    if settings.JOBS_BACKEND == "celery":
        from kombu.exceptions import OperationalError

        from .tasks import run_job

        try:
            run_job.delay(_path(fn), list(args), kwargs)
            return
        except OperationalError:
            log.warning("Redis unreachable: running %s in the web process instead", _path(fn))
    _in_thread(fn, args, kwargs)
