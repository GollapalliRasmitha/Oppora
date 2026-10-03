"""
Demo seed loader. The seed itself lives in frontend/lib/mock/seed.ts (the one
shared seed file, PROMPT.md §4); `export_seed()` runs it through Node for a
given day and `load_seed()` writes it to the database for one user.
"""

import json
import os
import shutil
import subprocess
from datetime import date, timedelta

from django.conf import settings
from django.db import transaction

from accounts.models import GmailConnection, User, UserPreference
from core import clock
from core.domain.constants import deadline_kind
from core.domain.dates import parse_dt
from core.domain.match import explain_match
from mail.models import Email, EmailClassification
from notifications.models import Notification
from opportunities.models import Application, Deadline, Interview, Opportunity, SavedItem

FRONTEND_DIR = settings.REPO_DIR / "frontend"


class SeedError(RuntimeError):
    pass


def export_seed(day: date | None = None, tz: str | None = None) -> dict:
    """Runs scripts/export-seed.ts; dates are resolved for `day` in time zone `tz`."""
    node = shutil.which("node")
    cli = FRONTEND_DIR / "node_modules" / "tsx" / "dist" / "cli.mjs"
    if not node:
        raise SeedError("Node.js is needed to read the seed (frontend/lib/mock/seed.ts). Install Node 20+.")
    if not cli.exists():
        raise SeedError("frontend/node_modules is missing. Run `npm install` in /frontend first.")
    args = [node, str(cli), "scripts/export-seed.ts"]
    if day:
        args += ["--date", day.isoformat()]
    tz = tz or settings.DEFAULT_USER_TIMEZONE
    env = {**os.environ, "TZ": tz}
    try:
        out = subprocess.run(
            args, cwd=FRONTEND_DIR, env=env, capture_output=True, text=True, encoding="utf-8", check=True, timeout=120
        )
    except subprocess.CalledProcessError as e:
        raise SeedError(f"Seed export failed:\n{e.stderr}") from e
    data = json.loads(out.stdout)
    data["timeZone"] = tz  # Node may report a legacy alias (Asia/Calcutta)
    return data


def clear_user_data(user: User) -> None:
    """Deletes everything Oppora stored for the user (the account itself remains)."""
    with transaction.atomic():
        Notification.objects.filter(user=user).delete()
        SavedItem.objects.filter(user=user).delete()
        Interview.objects.filter(user=user).delete()
        Email.objects.filter(user=user).delete()
        Opportunity.objects.filter(user=user).delete()  # cascades deadlines + applications


@transaction.atomic
def load_seed(exported: dict, email: str | None = None) -> tuple[User, dict[str, str]]:
    """
    Writes the exported seed for one user (replacing their data) and returns
    the user plus a map of seed ids → database ids.
    """
    seed = exported["seed"]
    su = seed["user"]
    email = (email or su["email"]).lower()

    user, _ = User.objects.get_or_create(email=email, defaults={"name": su["name"]})
    user.name = su["name"]
    user.plan = su["plan"]
    user.interests = su["interests"]
    user.skills = su["skills"]
    user.experience_level = su["experienceLevel"]
    user.timezone = exported.get("timeZone") or settings.DEFAULT_USER_TIMEZONE
    user.save()
    clear_user_data(user)

    p = seed["preferences"]
    UserPreference.objects.update_or_create(
        user=user,
        defaults={
            "notify_email": p["notifications"]["email"],
            "notify_deadline_reminders": p["notifications"]["deadlineReminders"],
            "notify_new_opportunities": p["notifications"]["newOpportunities"],
            "notify_weekly_digest": p["notifications"]["weeklyDigest"],
            "language": p["language"],
            "minimum_match": p["minimumMatch"],
            "preferred_locations": p["preferredLocations"],
            "ai_recommendations": p["ai"]["recommendations"],
            "personalization": p["ai"]["personalization"],
            "categories": p["ai"]["categories"],
        },
    )
    g = seed["gmail"]
    GmailConnection.objects.update_or_create(
        user=user,
        defaults={
            "email": g["email"],
            "status": g["status"],
            "connected_at": parse_dt(g["connectedAt"]) if g["connectedAt"] else None,
            "scopes": g["scopes"],
            "initial_sync_days": g["initialSyncDays"],
            "sync_phase": GmailConnection.Phase.COMPLETED,
            "sync_started_at": None,
            "sync_emails_in_batch": 0,
            # Demo: the last background sync finished two minutes ago.
            "last_synced_at": clock.now() - timedelta(minutes=2),
        },
    )

    profile = {"interests": user.interests, "skills": user.skills, "experienceLevel": user.experience_level}
    ids: dict[str, str] = {}
    opps: dict[str, Opportunity] = {}
    # One by one (not bulk) so created_at follows seed order, which the
    # assistant and lists use to break ties exactly like the frontend did.
    for o in seed["opportunities"]:
        opp = Opportunity.objects.create(
            user=user,
            title=o["title"],
            organization=o["organization"],
            type=o["type"],
            priority=o["priority"],
            match_score=o["matchScore"],
            discovered_at=parse_dt(o["discoveredAt"]),
            summary=o["summary"],
            location=o["location"],
            duration=o["duration"],
            eligibility=o["eligibility"],
            skills=o["skills"],
            requirements=o["requirements"],
            benefits=o["benefits"],
            application_link=o["applicationLink"],
            match_reasons=explain_match(o, profile),
            reminder_set=o["reminderSet"],
            dismissed=o["dismissed"],
        )
        opps[o["id"]] = opp
        ids[o["id"]] = str(opp.id)
        if o["deadline"]:
            Deadline.objects.create(
                user=user, opportunity=opp, due_date=date.fromisoformat(o["deadline"]), kind=deadline_kind(o["type"])
            )
        if a := o["application"]:
            Application.objects.create(
                user=user,
                opportunity=opp,
                status=a["status"],
                started_at=parse_dt(a["startedAt"]),
                applied_at=parse_dt(a["appliedAt"]) if a["appliedAt"] else None,
            )
        if o["saved"]:
            SavedItem.objects.create(user=user, opportunity=opp)

    emails: dict[str, Email] = {}
    for e in seed["emails"]:
        row = Email.objects.create(
            user=user,
            gmail_message_id=e["id"],
            sender=e["sender"],
            sender_email=e["senderEmail"],
            subject=e["subject"],
            snippet=e["snippet"],
            received_at=parse_dt(e["receivedAt"]),
            read=e["read"],
            archived=e["archived"],
            opportunity=opps.get(e["opportunityId"]) if e["opportunityId"] else None,
        )
        EmailClassification.objects.create(email=row, category=e["category"], relevance=e["relevance"], model_name="seed")
        if e["saved"]:
            SavedItem.objects.create(user=user, email=row)
        emails[e["id"]] = row
        ids[e["id"]] = str(row.id)

    # The first email about an opportunity is where its deadline came from.
    for d in Deadline.objects.filter(user=user).select_related("opportunity"):
        first = Email.objects.filter(user=user, opportunity=d.opportunity).order_by("received_at").first()
        if first:
            d.source_email = first
            d.save(update_fields=["source_email"])

    for iv in seed["interviews"]:
        row = Interview.objects.create(
            user=user,
            opportunity=opps[iv["opportunityId"]],
            title=iv["title"],
            start=parse_dt(iv["start"]),
            end=parse_dt(iv["end"]) if iv["end"] else None,
            location=iv["location"],
            source_email=emails.get(iv["sourceEmailId"]),
        )
        ids[iv["id"]] = str(row.id)

    return user, ids
