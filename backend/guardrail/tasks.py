from celery import shared_task


@shared_task
def flush_outbox():
    """Celery Beat, every 10 minutes: resend events GuardRail couldn't take earlier (nothing if switched off)."""
    from guardrail.client import flush_outbox as flush
    from guardrail.client import is_enabled

    return flush() if is_enabled() else "off"
