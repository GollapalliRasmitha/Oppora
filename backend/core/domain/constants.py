"""Shared vocabulary (mirrors frontend/lib/domain/types.ts)."""

OPPORTUNITY_TYPES = ("Internship", "Job", "Hackathon", "Scholarship", "Competition", "Fellowship", "Event")
EMAIL_CATEGORIES = OPPORTUNITY_TYPES + ("College", "Newsletter", "Promotion", "Other")
PRIORITIES = ("High", "Medium", "Low")

#: Match score at or above which an opportunity counts as a strong match.
STRONG_MATCH = 88
#: "Deadlines this week" / "coming up soon" window, in days from today.
SOON_WINDOW_DAYS = 7
#: Reminders fire at 09:00 the day before the deadline.
REMINDER_HOUR = 9


def deadline_kind(opp_type: str) -> str:
    if opp_type in ("Hackathon", "Competition"):
        return "hackathon"
    if opp_type in ("Scholarship", "Fellowship"):
        return "scholarship"
    return "application"


def is_opportunity_category(category: str) -> bool:
    return category in OPPORTUNITY_TYPES
