from django.apps import AppConfig
from django.conf import settings
from django.utils.autoreload import autoreload_started


def watch_env_file(sender, **kwargs):
    """`runserver` restarts when ../.env changes, so edited keys apply without a manual restart."""
    sender.extra_files.add(settings.ENV_FILE)


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        autoreload_started.connect(watch_env_file)
