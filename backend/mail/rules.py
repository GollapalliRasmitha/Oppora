"""
Rules-only reading of an email, for users who chose "Use without AI" on the
consent screen. Nothing leaves the server.

It only takes what the email literally says (PROMPT.md §7: never guess):
- type: opportunity words in the subject (then the text)
- organization: the sender's display name (or their domain)
- title: the cleaned-up subject
- deadline: a date written next to "deadline", "apply by", "last date",
  "closes", "register by", "before", "until"
- application link: a link near "apply" / "register" (or whose address says so)
- eligibility: the sentence about who can apply
- skills: the user's own skills the email mentions
- fee: a sentence that states a fee with an amount
Everything else stays null ("Not mentioned in email"). It's less thorough than
the AI, and it says so in Settings.
"""

import re
from datetime import date

from ai.extract import Extraction
from ai.fees import rule_fee
from core.domain.match import _mentions, matched_skills_for

from .content import MessageContent

#: In priority order: the first type whose words appear wins.
TYPE_WORDS = [
    ("Hackathon", r"hackathons?|code-?a-?thon|buildathon|ideathon"),
    ("Scholarship", r"scholarships?|bursar(y|ies)|tuition (award|grant)|grants? for students"),
    ("Fellowship", r"fellowships?"),
    ("Internship", r"intern(ship)?s?"),
    ("Competition", r"competitions?|contests?|challenges?|olympiads?|quiz(zes)?|code sprint"),
    ("Job", r"jobs?|hiring|vacanc(y|ies)|openings?|positions?|roles?|careers?|recruit(ing|ment)"),
    ("Event", r"webinars?|workshops?|conferences?|meetups?|summits?|bootcamps?|info(rmation)? sessions?|tech talks?"),
]
MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
]
_MON = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
DATE_PATTERNS = [
    re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"),  # 2026-10-20
    re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?{_MON}\.?,?(?:\s+(\d{{4}}))?\b", re.I),  # 20 October 2026
    re.compile(rf"\b{_MON}\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:,?\s+(\d{{4}}))?\b", re.I),  # October 20, 2026
    re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b"),  # 20/10/2026 (day first, as in India)
]
DEADLINE_WORDS = re.compile(
    r"\b(deadline|apply (?:by|before)|applications? close|closes?|closing|last date|register (?:by|before)|"
    r"registrations? close|submit (?:by|before)|due(?: date| by)?|before|until|till|ends? on)\b",
    re.I,
)
APPLY_WORDS = re.compile(r"\b(apply|application|register|registration|sign up|enrol|form)\b", re.I)
APPLY_URL = re.compile(r"(?i)apply|register|registration|careers|jobs|forms?\b|signup|enrol")
SKIP_URL = re.compile(r"(?i)unsubscribe|preferences|privacy|facebook|twitter|instagram|linkedin\.com/(company|in)/")
ELIGIBILITY = re.compile(r"\b(eligib\w*|open to|students?|undergraduates?|graduates?|freshers?|final[- ]year|batch of)\b", re.I)
_SENTENCES = re.compile(r"(?<=[.!?])\s+|\n+")


def _month(token: str) -> int:
    t = token.lower()[:3]
    return next(i for i, m in enumerate(MONTHS, 1) if m.startswith(t))


def _dates(text: str, sent: date) -> list[tuple[int, date]]:
    """Every date in the text with its position. Without a year, the next one on/after the sent day is meant."""
    out = []
    for i, pattern in enumerate(DATE_PATTERNS):
        for m in pattern.finditer(text):
            try:
                if i == 0:
                    d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                elif i == 1:
                    day, month, year = int(m.group(1)), _month(m.group(2)), m.group(3)
                    d = _with_year(day, month, year, sent)
                elif i == 2:
                    month, day, year = _month(m.group(1)), int(m.group(2)), m.group(3)
                    d = _with_year(day, month, year, sent)
                else:
                    d = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            except (ValueError, StopIteration):
                continue
            out.append((m.start(), d))
    return out


def _with_year(day: int, month: int, year: str | None, sent: date) -> date:
    if year:
        return date(int(year), month, day)
    d = date(sent.year, month, day)
    return d if d >= sent else date(sent.year + 1, month, day)


def find_deadline(text: str, sent: date) -> date | None:
    """A date written right after a deadline phrase (within 60 characters), never just any date."""
    dates = _dates(text, sent)
    for kw in DEADLINE_WORDS.finditer(text):
        near = [d for pos, d in dates if kw.end() <= pos <= kw.end() + 60]
        if near:
            return near[0]
    return None


def find_application_link(m: MessageContent) -> str | None:
    text = f"{m.subject}\n{m.body}"
    candidates = [u for u in m.urls if not SKIP_URL.search(u)]
    for u in candidates:  # a link whose surrounding words say "apply" / "register"
        pos = text.find(u)
        if pos >= 0 and APPLY_WORDS.search(text[max(0, pos - 80) : pos]):
            return u
    return next((u for u in candidates if APPLY_URL.search(u)), None)


def find_type(m: MessageContent) -> tuple[str | None, bool]:
    """(type, found in the subject)."""
    for where, text in ((True, m.subject), (False, m.body)):
        for kind, words in TYPE_WORDS:
            if re.search(rf"\b({words})\b", text, re.I):
                return kind, where
    return None, False


def _organization(m: MessageContent) -> str | None:
    name = re.sub(r"\b(no-?reply|team|careers|recruiting|recruitment|hr|talent|notifications?)\b", "", m.sender_name, flags=re.I)
    name = re.sub(r"\s{2,}", " ", name).strip(" -|·,")
    if name:
        return name[:200]
    domain = m.sender_email.rsplit("@", 1)[-1].split(".")[0] if "@" in m.sender_email else ""
    return domain.capitalize() or None


def _title(subject: str) -> str:
    t = re.sub(r"^((re|fwd?|reminder|invitation|update)\s*:\s*)+", "", subject, flags=re.I).strip()
    return t[:200] or subject[:200]


def _summary(body: str) -> str | None:
    sentences = [s.strip() for s in _SENTENCES.split(body) if len(s.strip()) > 20 and "http" not in s]
    return " ".join(sentences[:2])[:300] or None


def _eligibility(body: str) -> str | None:
    for s in _SENTENCES.split(body):
        s = s.strip()
        if ELIGIBILITY.search(s) and len(s) > 15:
            return s[:300]
    return None


def rules_extract(m: MessageContent, user, tz) -> Extraction:
    text = f"{m.subject}\n{m.body}"
    kind, in_subject = find_type(m)
    sent = m.received_at.astimezone(tz).date()
    lower = text.lower()
    interests_hit = sum(
        1 for i in user.interests if all(_mentions(lower, w) for w in re.findall(r"[a-z0-9+#.]+", i.lower()) if len(w) > 2)
    )
    opp_fields = {"title": m.subject, "summary": m.body, "skills": [], "requirements": []}
    return Extraction(
        category=kind or "Other",
        is_opportunity=kind is not None,
        relevance=min(90, 55 + 10 * interests_hit) if kind else 30,
        priority=None,
        summary=_summary(m.body),
        organization=_organization(m),
        opportunity_name=_title(m.subject),
        deadline=find_deadline(text, sent),
        eligibility=_eligibility(m.body),
        location=None,
        duration=None,
        skills=matched_skills_for(opp_fields, user.skills),
        requirements=[],
        benefits=[],
        application_link=find_application_link(m),
        action_required=None,
        interview=None,
        confidence=0.7 if in_subject else 0.55,
        fee=rule_fee(text),
        model="rules",
    )
