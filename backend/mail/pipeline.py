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
from ai.fees import FEE_PENALTY
from ai.providers.base import InvalidOutput, NotConfigured
from core import clock
from core.domain.constants import OPPORTUNITY_TYPES, deadline_kind
from core.domain.dates import days_left
from core.domain.match import explain_match
from opportunities.models import Deadline, HiddenSender, Interview, Opportunity

from .content import MessageContent, parse_message
from .models import Email, EmailClassification, ProcessedMessage
from .prefilter import prefilter
from .rules import rules_extract


class AIChoiceRequired(NotConfigured):
    """The user hasn't answered the AI consent screen yet: nothing is analysed (emails stay queued)."""


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


#: Profile checks and their weight. A check the email (or profile) can't answer is left out
#: ("neutral"), so it neither helps nor hurts: the profile score is points ÷ points checked.
PROFILE_CHECKS = (
    ("interests", "Interests", 40),
    ("skills", "Skills", 30),
    ("experience", "Level", 15),
    ("deadline", "Deadline", 15),
)


def profile_parts(reasons: dict, opp_skills: list[str], deadline, now) -> list[dict]:
    parts = []
    for key, label, weight in PROFILE_CHECKS:
        if key == "deadline":
            d = days_left(deadline, now) if deadline else None
            status, points = ("passed", 0) if d is not None and d < 0 else ("open" if deadline else "not_mentioned", weight)
        else:
            status = reasons[key]
            if status == "met":
                if key == "skills":
                    needed = max(1, min(3, len(opp_skills))) if opp_skills else 1
                    points = round(weight * min(1, len(reasons["matchedSkills"]) / needed))
                else:
                    points = weight
            elif status == "unmet":
                points = 0
            else:
                points = None  # unknown → neutral, left out
        parts.append({"key": key, "label": label, "status": status, "points": points, "max": weight})
    return parts


def profile_score(parts: list[dict]) -> int:
    """
    Points ÷ points checked. If none of the fit checks (interests, skills, level)
    could be checked, the profile says nothing either way: neutral 50 (0 once the
    deadline has passed), never a perfect score from the deadline alone.
    """
    fit_known = [p for p in parts if p["key"] != "deadline" and p["points"] is not None]
    deadline = next(p for p in parts if p["key"] == "deadline")
    if not fit_known:
        return 50 if deadline["points"] else 0
    counted = [*fit_known, deadline]
    return round(sum(p["points"] for p in counted) / sum(p["max"] for p in counted) * 100)


def score_breakdown(
    relevance: int, reasons: dict, skills: list[str], deadline, location: str | None, prefs, now, asks_fee: bool = False
) -> dict:
    """
    The match %, explained: AI relevance blended with the profile checks
    (personalization sets the blend), plus a preferred-location bonus and the
    fee penalty. Stored on the opportunity; the details page shows it.
    """
    parts = profile_parts(reasons, skills, deadline, now)
    profile = profile_score(parts)
    w = PROFILE_WEIGHT.get(prefs.personalization, 0.5)
    bonus = 5 if location and any(loc.lower() in location.lower() for loc in prefs.preferred_locations) else 0
    penalty = FEE_PENALTY if asks_fee else 0
    return {
        "relevance": relevance,
        "profileWeight": w,
        "profile": profile,
        "parts": parts,
        "locationBonus": bonus,
        "feePenalty": penalty,
        "score": total_from_breakdown(relevance, w, profile, bonus, penalty),
    }


def total_from_breakdown(relevance: int, w: float, profile: int, bonus: int, penalty: int) -> int:
    return max(0, min(100, round((1 - w) * relevance + w * profile + bonus - penalty)))


def blend(
    relevance: int, reasons: dict, skills: list[str], deadline, location: str | None, prefs, now, asks_fee: bool = False
) -> int:
    return score_breakdown(relevance, reasons, skills, deadline, location, prefs, now, asks_fee)["score"]


def match_score(x: Extraction, reasons: dict, prefs, now) -> int:
    return blend(x.relevance, reasons, x.skills, x.deadline, x.location, prefs, now, asks_fee=bool(x.fee))


def apply_fee_penalty(o: Opportunity) -> None:
    """A fee found later (follow-up email or re-check): lower the score the same way scoring does."""
    bd = o.score_breakdown
    if bd and not bd.get("feePenalty"):
        bd["feePenalty"] = FEE_PENALTY
        bd["score"] = total_from_breakdown(bd["relevance"], bd["profileWeight"], bd["profile"], bd["locationBonus"], FEE_PENALTY)
        o.score_breakdown, o.match_score = bd, bd["score"]
    elif not bd:
        o.match_score = max(0, o.match_score - FEE_PENALTY)


def match_input(o) -> dict:
    """What explain_match reads, from an Opportunity row."""
    return {
        "title": o.title,
        "type": o.type,
        "skills": o.skills,
        "eligibility": o.eligibility,
        "summary": o.summary,
        "requirements": o.requirements,
    }


def set_fee(o: Opportunity, fee: dict | None, now) -> list[str]:
    """Stores a detected fee on the opportunity (never removes one an email stated). Returns changed fields."""
    o.fee_checked_at = now
    if not fee or o.fee_text:
        return ["fee_checked_at"]
    o.fee_amount, o.fee_currency, o.fee_text = fee["amount"], fee["currency"], fee["text"]
    o.priority = "Low"
    return ["fee_amount", "fee_currency", "fee_text", "priority", "fee_checked_at"]


def rescore(user, now) -> int:
    """
    After a profile or preference change (or a matching improvement): re-explain
    every match, and recompute the match % and its breakdown for opportunities
    the AI found, reusing the relevance it stored (no new AI requests). Seeded
    demo scores stay as designed. Returns how many scores changed.
    """
    profile = {"interests": user.interests, "skills": user.skills, "experienceLevel": user.experience_level}
    prefs = user.preferences
    opps = list(Opportunity.objects.filter(user=user).select_related("deadline"))
    first_email = {}
    for e in Email.objects.filter(user=user, opportunity__isnull=False).select_related("classification").order_by("received_at"):
        first_email.setdefault(e.opportunity_id, e)
    changed = 0
    for o in opps:
        o.match_reasons = explain_match(match_input(o), profile)
        e = first_email.get(o.id)
        c = getattr(e, "classification", None) if e else None
        if c is None or c.model_name == "seed":
            continue
        deadline = o.deadline.due_date if hasattr(o, "deadline") else None
        bd = score_breakdown(c.relevance, o.match_reasons, o.skills, deadline, o.location, prefs, now, asks_fee=bool(o.fee_text))
        if bd["score"] != o.match_score:
            changed += 1
        o.match_score, o.score_breakdown = bd["score"], bd
    Opportunity.objects.bulk_update(opps, ["match_reasons", "match_score", "score_breakdown"])
    return changed


def priority_for(x: Extraction, score: int, now) -> str:
    """The AI's priority when it gave one; a close deadline on a good match always makes it High. Fees → Low."""
    if x.fee:
        return "Low"
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
        if x.fee and not opp.fee_text:
            changed += set_fee(opp, x.fee, now)
            apply_fee_penalty(opp)
            changed += ["match_score", "score_breakdown"]
        if changed:
            opp.save(update_fields=list(dict.fromkeys(changed)))
        outcome = "linked"
    else:
        if x.category not in prefs.categories:
            return Outcome(ProcessedMessage.Status.DONE, "category_off", email)
        profile = {"interests": user.interests, "skills": user.skills, "experienceLevel": user.experience_level}
        title = x.opportunity_name or re.sub(r"^(invitation|reminder|re|fwd?)\s*:\s*", "", m.subject, flags=re.I).strip()
        reasons = explain_match(
            {"title": title, "type": x.category, "skills": x.skills, "eligibility": x.eligibility,
             "summary": x.summary, "requirements": x.requirements},
            profile,
        )  # fmt: skip
        breakdown = score_breakdown(x.relevance, reasons, x.skills, x.deadline, x.location, prefs, now, asks_fee=bool(x.fee))
        score = breakdown["score"]
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
            score_breakdown=breakdown,
            fee_amount=x.fee["amount"] if x.fee else None,
            fee_currency=x.fee["currency"] if x.fee else "",
            fee_text=x.fee["text"] if x.fee else "",
            fee_checked_at=now,
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
    if HiddenSender.objects.filter(user=user, sender_email=m.sender_email).exists():
        return Outcome(ProcessedMessage.Status.SKIPPED, "hidden_sender")
    if m.message_id != gmail_message_id or Email.objects.filter(user=user, gmail_message_id=m.message_id).exists():
        return Outcome(ProcessedMessage.Status.SKIPPED, "duplicate")
    tz = clock.zone(user.timezone) or clock.zone(settings.DEFAULT_USER_TIMEZONE)
    from accounts.models import UserPreference

    # Read fresh for every email: a change in Settings → Privacy applies to the very next one.
    mode = UserPreference.objects.filter(user=user).values_list("ai_mode", flat=True).first()
    if mode == "rules":
        x = rules_extract(m, user, tz)  # "Use without AI": nothing leaves the server
        if x.category not in OPPORTUNITY_TYPES:
            x.is_opportunity = False
        return store(user, m, x)
    if mode != "ai":
        raise AIChoiceRequired("Waiting for the user's choice on the AI consent screen.")
    try:
        x = extract(m, user, tz)
    except InvalidOutput as e:
        return Outcome(ProcessedMessage.Status.NEEDS_REVIEW, "invalid_output", error=str(e))
    if x.category not in OPPORTUNITY_TYPES:
        x.is_opportunity = False
    return store(user, m, x)
