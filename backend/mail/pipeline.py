"""
Email → Clean → Pre-filter → Classify + Extract + Summarize (one AI call) →
Prioritize → Store (PROMPT.md §7). One Gmail message at a time; idempotent
on the Gmail message id (ProcessedMessage).
"""

import re
from dataclasses import dataclass

from django.conf import settings
from django.db import transaction

from ai.extract import Extraction, extract
from ai.providers.base import InvalidOutput
from core import clock
from core.domain.constants import OPPORTUNITY_TYPES, deadline_kind
from core.domain.dates import days_left
from core.domain.match import explain_match
from opportunities.models import Deadline, Interview, Opportunity

from .content import MessageContent, parse_message
from .models import Email, EmailClassification, ProcessedMessage
from .prefilter import prefilter

#: Below this, an email that isn't an opportunity isn't worth keeping.
MIN_RELEVANCE_TO_STORE = 50
#: Below this, the extraction is stored for review instead of becoming an opportunity.
MIN_CONFIDENCE = 0.5

PROFILE_WEIGHT = {"low": 0.3, "balanced": 0.5, "high": 0.7}


@dataclass
class Outcome:
    status: str
    outcome: str
    email: Email | None = None
    error: str = ""


# --- Scoring -------------------------------------------------------------------


def profile_score(reasons: dict, opp_skills: list[str], deadline, now) -> int:
    """0-100 from the stored match reasons (the same checks the AI Summary shows)."""
    score = 40 if reasons["interests"] == "met" else 0
    if reasons["skills"] == "met":
        score += round(30 * min(1, len(reasons["matchedSkills"]) / max(1, min(3, len(opp_skills)))))
    elif reasons["skills"] == "unknown":
        score += 15
    score += {"met": 15, "unknown": 8}.get(reasons["experience"], 0)
    d = days_left(deadline, now) if deadline else None
    score += 0 if d is not None and d < 0 else 15
    return score


def blend(relevance: int, reasons: dict, skills: list[str], deadline, location: str | None, prefs, now) -> int:
    """AI relevance blended with the profile checks; personalization sets the blend."""
    w = PROFILE_WEIGHT.get(prefs.personalization, 0.5)
    score = (1 - w) * relevance + w * profile_score(reasons, skills, deadline, now)
    if location and any(loc.lower() in location.lower() for loc in prefs.preferred_locations):
        score += 5
    return max(0, min(100, round(score)))


def match_score(x: Extraction, reasons: dict, prefs, now) -> int:
    return blend(x.relevance, reasons, x.skills, x.deadline, x.location, prefs, now)


def rescore(user, now) -> int:
    """
    After a profile or preference change: re-explain every match, and recompute
    the match % of opportunities the AI found, reusing the relevance it stored
    (no new AI requests). Seeded demo scores stay as designed. Returns how many
    scores changed.
    """
    profile = {"interests": user.interests, "skills": user.skills, "experienceLevel": user.experience_level}
    prefs = user.preferences
    opps = list(Opportunity.objects.filter(user=user).select_related("deadline"))
    first_email = {}
    for e in Email.objects.filter(user=user, opportunity__isnull=False).select_related("classification").order_by("received_at"):
        first_email.setdefault(e.opportunity_id, e)
    changed = 0
    for o in opps:
        o.match_reasons = explain_match(
            {"title": o.title, "type": o.type, "skills": o.skills, "eligibility": o.eligibility}, profile
        )
        e = first_email.get(o.id)
        c = getattr(e, "classification", None) if e else None
        if c is None or c.model_name == "seed":
            continue
        deadline = o.deadline.due_date if hasattr(o, "deadline") else None
        score = blend(c.relevance, o.match_reasons, o.skills, deadline, o.location, prefs, now)
        if score != o.match_score:
            o.match_score = score
            changed += 1
    Opportunity.objects.bulk_update(opps, ["match_reasons", "match_score"])
    return changed


def priority_for(x: Extraction, score: int, now) -> str:
    """The AI's priority when it gave one; a close deadline on a good match always makes it High."""
    d = days_left(x.deadline, now) if x.deadline else None
    if d is not None and 0 <= d <= 3 and score >= 70:
        return "High"
    if x.priority:
        return x.priority
    if score >= 85 or (d is not None and 0 <= d <= 7 and score >= 70):
        return "High"
    return "Medium" if score >= 65 else "Low"


# --- Matching an email to an existing opportunity -------------------------------------


def _key(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def find_existing(user, m: MessageContent, x: Extraction) -> Opportunity | None:
    """Follow-ups (same Gmail thread, or same organization + name) attach to the opportunity they're about."""
    if m.thread_id:
        e = Email.objects.filter(user=user, gmail_thread_id=m.thread_id, opportunity__isnull=False).first()
        if e:
            return e.opportunity
    name, org = _key(x.opportunity_name), _key(x.organization)
    if not name:
        return None
    # Any type: the same programme can be read as a Hackathon in one email and a Competition in another.
    for o in Opportunity.objects.filter(user=user):
        t = _key(o.title)
        if (name == t or (len(name) > 6 and (name in t or t in name))) and (
            not org or org in _key(o.organization) or _key(o.organization) in org
        ):
            return o
    return None


def _fill_missing(o: Opportunity, x: Extraction) -> list[str]:
    """Adds facts a follow-up email states that the opportunity doesn't have yet. Never overwrites."""
    changed = []
    for field, value in [
        ("summary", x.summary), ("location", x.location), ("duration", x.duration),
        ("eligibility", x.eligibility), ("application_link", x.application_link),
    ]:  # fmt: skip
        if value and not getattr(o, field):
            setattr(o, field, value)
            changed.append(field)
    for field, values in [("skills", x.skills), ("requirements", x.requirements), ("benefits", x.benefits)]:
        if values and not getattr(o, field):
            setattr(o, field, values)
            changed.append(field)
    return changed


# --- Store -------------------------------------------------------------------------


@transaction.atomic
def store(user, m: MessageContent, x: Extraction) -> Outcome:
    prefs = user.preferences
    now = clock.now().astimezone(clock.zone(user.timezone) or clock.zone(settings.DEFAULT_USER_TIMEZONE))

    if not x.is_opportunity and x.relevance < MIN_RELEVANCE_TO_STORE:
        return Outcome(ProcessedMessage.Status.DONE, "not_relevant")

    review = x.confidence < MIN_CONFIDENCE
    email = Email.objects.create(
        user=user,
        gmail_message_id=m.message_id,
        gmail_thread_id=m.thread_id,
        sender=m.sender_name,
        sender_email=m.sender_email or "unknown@invalid",
        subject=m.subject,
        snippet=m.snippet,
        received_at=m.received_at,
    )
    EmailClassification.objects.create(
        email=email,
        category=x.category,
        relevance=x.relevance,
        confidence=x.confidence,
        status=EmailClassification.Status.NEEDS_REVIEW if review else EmailClassification.Status.CLASSIFIED,
        model_name=x.model[:64],
    )
    if not x.is_opportunity:
        return Outcome(ProcessedMessage.Status.DONE, "stored_email", email)
    if review:
        return Outcome(ProcessedMessage.Status.NEEDS_REVIEW, "low_confidence", email)

    opp = find_existing(user, m, x)
    if opp:
        changed = _fill_missing(opp, x)
        if changed:
            opp.save(update_fields=changed)
        outcome = "linked"
    else:
        if x.category not in prefs.categories:
            return Outcome(ProcessedMessage.Status.DONE, "category_off", email)
        profile = {"interests": user.interests, "skills": user.skills, "experienceLevel": user.experience_level}
        title = x.opportunity_name or re.sub(r"^(invitation|reminder|re|fwd?)\s*:\s*", "", m.subject, flags=re.I).strip()
        reasons = explain_match({"title": title, "type": x.category, "skills": x.skills, "eligibility": x.eligibility}, profile)
        score = match_score(x, reasons, prefs, now)
        if score < prefs.minimum_match:
            return Outcome(ProcessedMessage.Status.DONE, "below_minimum_match", email)
        opp = Opportunity.objects.create(
            user=user,
            title=title[:200],
            organization=(x.organization or m.sender_name)[:200],
            type=x.category,
            priority=priority_for(x, score, now),
            match_score=score,
            discovered_at=m.received_at,
            summary=x.summary,
            location=x.location,
            duration=x.duration,
            eligibility=x.eligibility,
            skills=x.skills,
            requirements=x.requirements,
            benefits=x.benefits,
            application_link=x.application_link,
            match_reasons=reasons,
        )
        outcome = "stored"

    email.opportunity = opp
    email.save(update_fields=["opportunity"])
    if x.deadline and not Deadline.objects.filter(opportunity=opp).exists():
        Deadline.objects.create(user=user, opportunity=opp, due_date=x.deadline, kind=deadline_kind(opp.type), source_email=email)
    if x.interview and not Interview.objects.filter(opportunity=opp, start=x.interview["start"]).exists():
        Interview.objects.create(
            user=user,
            opportunity=opp,
            title=f"Interview — {opp.organization}"[:200],
            start=x.interview["start"],
            end=x.interview["end"],
            location=x.interview["location"],
            source_email=email,
        )
    return Outcome(ProcessedMessage.Status.DONE, outcome, email)


def process_message(user, client, gmail_message_id: str) -> Outcome:
    """
    Fetches, filters, extracts and stores one message. AI quota errors
    (DailyLimitReached, NotConfigured, TransientAIError) propagate so the caller
    can leave the message queued; everything else resolves to an Outcome.
    """
    raw = client.get(gmail_message_id)
    if raw is None:
        return Outcome(ProcessedMessage.Status.SKIPPED, "gone")
    m = parse_message(raw, settings.AI_MAX_BODY_CHARS)
    if reason := prefilter(m, own_email=user.gmail.email):
        return Outcome(ProcessedMessage.Status.SKIPPED, reason)
    if m.message_id != gmail_message_id or Email.objects.filter(user=user, gmail_message_id=m.message_id).exists():
        return Outcome(ProcessedMessage.Status.SKIPPED, "duplicate")
    tz = clock.zone(user.timezone) or clock.zone(settings.DEFAULT_USER_TIMEZONE)
    try:
        x = extract(m, user, tz)
    except InvalidOutput as e:
        return Outcome(ProcessedMessage.Status.NEEDS_REVIEW, "invalid_output", error=str(e))
    if x.category not in OPPORTUNITY_TYPES:
        x.is_opportunity = False
    return store(user, m, x)
