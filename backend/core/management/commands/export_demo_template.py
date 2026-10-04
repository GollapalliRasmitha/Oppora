from datetime import date

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.demo import TEMPLATE_PATH
from core.seed import SeedError, export_seed

#: Any fixed day works: core.demo.shifted() moves every date to "today" when loading.
REFERENCE_DAY = date(2026, 10, 1)


class Command(BaseCommand):
    help = (
        "Writes core/demo_seed.json from frontend/lib/mock/seed.ts (needs Node). Production loads the demo "
        "from that file, so re-run this and commit the file whenever seed.ts changes."
    )

    def handle(self, *args, **opts):
        import json

        try:
            exported = export_seed(REFERENCE_DAY, settings.DEFAULT_USER_TIMEZONE)
        except SeedError as e:
            raise CommandError(str(e)) from e
        TEMPLATE_PATH.write_text(json.dumps(exported, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(f"Wrote {TEMPLATE_PATH.name} for {exported['today']} ({exported['timeZone']})."))
