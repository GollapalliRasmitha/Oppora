from django.conf import settings
from django.db import migrations


def mark_demo(apps, schema_editor):
    """The demo account was seeded before `is_demo` existed: flag it so its scans stay simulated."""
    GmailConnection = apps.get_model("accounts", "GmailConnection")
    GmailConnection.objects.filter(user__email=settings.DEMO_USER_EMAIL, refresh_token_enc="").update(is_demo=True)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_gmailconnection_access_token_enc_and_more")]

    operations = [migrations.RunPython(mark_demo, migrations.RunPython.noop)]
