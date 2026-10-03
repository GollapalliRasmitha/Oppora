import os
import sys
import threading

from django.apps import AppConfig


def _resume_later():
    from django.db import connections

    from .sync import resume_all_interrupted

    try:
        resume_all_interrupted()
    finally:
        connections.close_all()


class MailConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "mail"

    def ready(self):
        # Only in the process that serves requests (runserver's reloaded child), never in
        # migrate/shell/tests. A restart kills in-process sync threads; their queue is in the
        # database, so pick it up again shortly after start. Stage 9 moves this to Celery.
        if "runserver" in sys.argv and os.environ.get("RUN_MAIN") == "true":
            threading.Timer(3.0, _resume_later).start()
