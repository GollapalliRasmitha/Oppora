"""
Match explanation (port of frontend/lib/domain/match.ts — keep in sync; the
parity test compares both on the whole seed). A check is "unknown" whenever
the email or the profile doesn't give enough information.
"""

import re

from .dates import days_left, days_left_label

_I = re.IGNORECASE


def _any_skill(opp, pattern):
    return any(re.search(pattern, s, _I) for s in opp["skills"])


INTEREST_SIGNALS = {
    "frontend development": lambda o: (
        bool(re.search(r"front-?end|\bUI\b|web", o["title"], _I)) or _any_skill(o, r"react|css|html|typescript|web development")
    ),
    "software engineering": lambda o: (
        o["type"] in ("Internship", "Job")
        and (
            bool(re.search(r"software|engineer|developer|internship|explore", o["title"], _I))
            or _any_skill(o, r"software engineering|programming|data structures|algorithms")
        )
    ),
    "hackathons": lambda o: o["type"] == "Hackathon",
}


def _norm(s: str) -> str:
    return s.strip().lower()


def explain_match(opp: dict, user: dict) -> dict:
    """
    `opp` needs title, type, skills, eligibility; `user` needs interests,
    skills, experienceLevel (camelCase, like the API).
    """
    mine = {_norm(s) for s in user["skills"]}
    matched_skills = [s for s in opp["skills"] if _norm(s) in mine]
    if not opp["skills"] or not user["skills"]:
        skills = "unknown"
    else:
        skills = "met" if matched_skills else "unmet"

    matched_interests = [i for i in user["interests"] if (fn := INTEREST_SIGNALS.get(_norm(i))) and fn(opp)]
    interests = "met" if matched_interests else "unmet"

    experience = "unknown"
    level = user.get("experienceLevel")
    eligibility = opp.get("eligibility")
    if eligibility and level and re.search(r"student", level, _I):
        # Only claim a fit when the email explicitly targets students.
        if re.search(r"\bstudents?\b|undergraduate", eligibility, _I):
            experience = "met"

    return {
        "skills": skills,
        "interests": interests,
        "experience": experience,
        "matchedSkills": matched_skills,
        "matchedInterests": matched_interests,
    }


def _list(items: list[str]) -> str:
    if len(items) <= 1:
        return items[0] if items else ""
    return f"{', '.join(items[:-1])} and {items[-1]}"


def match_sentence(r: dict) -> str:
    if r["matchedInterests"]:
        return f"This opportunity matches your profile because of your interest in {_list(r['matchedInterests'])}."
    if r["matchedSkills"]:
        return f"This opportunity matches your profile because it uses skills you have: {_list(r['matchedSkills'])}."
    return "This opportunity is only a partial match for your profile."


def match_checklist(opp: dict, now) -> list[dict]:
    """The four AI Summary checks; unmet or unknown checks become warnings."""
    r = opp["matchReasons"]
    join = ", ".join
    skills = {
        "met": {"ok": True, "label": "Matches your skills", "detail": join(r["matchedSkills"])},
        "unmet": {"ok": False, "label": "Doesn't list skills from your profile", "detail": join(opp["skills"])},
        "unknown": {"ok": False, "label": "Skills not mentioned in email"},
    }[r["skills"]]
    interests = (
        {"ok": True, "label": "Matches your interests", "detail": join(r["matchedInterests"])}
        if r["interests"] == "met"
        else {"ok": False, "label": "Outside your listed interests"}
    )
    elig = opp.get("eligibility")
    experience = {
        "met": {"ok": True, "label": "Suitable experience level", "detail": elig},
        "unmet": {"ok": False, "label": "May not fit your experience level", "detail": elig},
        "unknown": {
            "ok": False,
            "label": "Check the eligibility for your level" if elig else "Eligibility not mentioned in email",
            "detail": elig,
        },
    }[r["experience"]]

    d = days_left(opp["deadline"], now)
    if d is None:
        deadline = {"ok": False, "label": "Deadline not mentioned in email"}
    elif d < 0:
        deadline = {"ok": False, "label": "Deadline has passed"}
    else:
        deadline = {"ok": True, "label": "Deadline is still available", "detail": days_left_label(d)}
    return [skills, interests, experience, deadline]
