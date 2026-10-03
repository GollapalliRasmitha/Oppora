"""
Celery app: Gmail sync and the AI pipeline run in a worker, never in a web request.

    celery -A config worker --pool=solo -l info     (Windows: solo pool, one process)
    celery -A config beat -l info                    (periodic jobs, see CELERY_BEAT_SCHEDULE)

start-oppora.ps1 starts both.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("oppora")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
