"""
Cheap rules that run before the AI (PROMPT.md §7: pre-filter). Only emails
that look like they could be about an opportunity are sent to the AI; the
rest are skipped and never stored. This is also what keeps the free tier's
daily limit for the emails that matter.
"""

import re

from .content import MessageContent

#: Gmail labels that are never opportunities.
SKIP_LABELS = {"SPAM", "TRASH", "CHAT", "DRAFT", "SENT", "CATEGORY_SOCIAL"}

OPPORTUNITY_WORDS = re.compile(
    r"\b(intern(ship)?s?|hackathons?|scholarships?|fellowships?|jobs?|hiring|vacanc(y|ies)|careers?|recruit(ing|ment|er)?|"
    r"positions?|roles?|apply|applications?|deadlines?|register|registration|competitions?|contests?|challenges?|"
    r"workshops?|webinars?|conferences?|summits?|bootcamps?|olympiads?|grants?|stipends?|placements?|campus|"
    r"interviews?|shortlisted|assessment|coding round|offer letter|programmes?|programs?)\b",
    re.IGNORECASE,
)
#: Words that only matter in the subject or the first lines (they're everywhere in footers).
STRONG_WORDS = re.compile(r"\b(intern(ship)?s?|hackathons?|scholarships?|fellowships?|interviews?|hiring|job)\b", re.IGNORECASE)
PROMO_WORDS = re.compile(
    r"(\d+\s?% off|\bsale\b|\bdiscount|\bcoupon|\bdeal(s)?\b|\bcashback|\bfree shipping|\blimited time offer)", re.IGNORECASE
)


def prefilter(m: MessageContent, own_email: str | None = None) -> str | None:
    """
    Returns a skip reason, or None when the email should go to the AI.
    """
    if SKIP_LABELS & set(m.labels):
        return "label"
    if own_email and m.sender_email == own_email.lower():
        return "own_message"
    if not m.body and not m.subject:
        return "empty"
    head = f"{m.subject}\n{m.body[:600]}"
    if "CATEGORY_PROMOTIONS" in m.labels and PROMO_WORDS.search(head) and not STRONG_WORDS.search(head):
        return "promotion"
    if not OPPORTUNITY_WORDS.search(f"{m.subject}\n{m.sender_name}\n{m.body[:2000]}"):
        return "no_opportunity_words"
    return None
