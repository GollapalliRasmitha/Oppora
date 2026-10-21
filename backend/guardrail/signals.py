"""
Successful sign-ins (Google, the developer login), through Django's own login signal: no view had to change.
The shared public demo account is never reported: recruiters sign in from many places, which would only raise
false "sign-in from a new IP" alerts.
"""

from django.contrib.auth.signals import user_logged_in
from django.dispatch import receiver

from guardrail.client import report


@receiver(user_logged_in)
def on_logged_in(sender, request, user, **kwargs):
    from core.demo import is_demo_user

    if is_demo_user(user):
        return
    report("admin_login" if getattr(user, "is_staff", False) else "login_success", request, actor=user.email)
