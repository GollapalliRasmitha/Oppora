from importlib import import_module

from celery import shared_task
from django.db import InterfaceError, OperationalError

#: The only functions run_job will call: a message in Redis can't name arbitrary code.
ALLOWED_JOBS = frozenset({"mail.sync.run_sync"})


@shared_task(
    name="core.run_job",
    acks_late=True,
    autoretry_for=(OperationalError, InterfaceError, ConnectionError),
    retry_backoff=True,
    retry_backoff_max=600,
    max_retries=5,
)
def run_job(path: str, args: list, kwargs: dict) -> None:
    """Runs a job enqueued with core.jobs.enqueue (a module-level function given by dotted path)."""
    if path not in ALLOWED_JOBS:
        raise ValueError(f"Job {path!r} is not allowed.")
    module, _, name = path.rpartition(".")
    getattr(import_module(module), name)(*args, **kwargs)
