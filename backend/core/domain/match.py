"""
Match explanation (port of frontend/lib/domain/match.ts — keep in sync; the
parity test compares both on the whole seed). A check is "unknown" whenever
the email or the profile doesn't give enough information.
"""

import json
import re
from pathlib import Path

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


_ALIASES: dict[str, list[str]] = {
    k: v
    for k, v in json.loads((Path(__file__).with_name("skill_aliases.json")).read_text(encoding="utf-8")).items()
    if not k.startswith("_")
}
_CANONICAL = {alias: canon for canon, aliases in _ALIASES.items() for alias in aliases}


def canonical_skill(skill: str) -> str:
    """'ReactJS' / 'React.js' / 'react' → 'react'; unknown skills stay as written (lowercased)."""
    s = re.sub(r"\s+", " ", _norm(skill))
    return _CANONICAL.get(s, _CANONICAL.get(s.replace(" ", ""), s))


def _mentions(text: str, phrase: str) -> bool:
    """Whole-word, case-insensitive: 'java' doesn't match 'javascript', 'c++' and 'node.js' work."""
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9+#])", text))


def _skill_text(opp: dict) -> str:
    """Where an email's skills can show up: the extracted list, title, description and requirements."""
    parts = [opp.get("title") or "", opp.get("summary") or "", *(opp.get("requirements") or []), *(opp.get("skills") or [])]
    return " \n ".join(parts).lower()


def matched_skills_for(opp: dict, user_skills: list[str]) -> list[str]:
    listed = {canonical_skill(s) for s in opp.get("skills") or []}
    text = _skill_text(opp)
    out = []
    for skill in user_skills:
        canon = canonical_skill(skill)
        aliases = _ALIASES.get(canon, [canon])
        if canon in listed or any(_mentions(text, a) for a in aliases):
            out.append(skill)
    return out


def _singular(word: str) -> str:
    return word[:-1] if len(word) > 3 and word.endswith("s") and not word.endswith("ss") else word


_STOP = {"and", "or", "the", "of", "in", "for", "to", "a", "an", "with", "on"}


def _interest_matches(interest: str, opp: dict) -> bool:
    key = _norm(interest)
    if (fn := INTEREST_SIGNALS.get(key)) and fn(opp):
        return True
    words = [_singular(w) for w in re.findall(r"[a-z0-9+#.]+", key) if w not in _STOP]
    if not words:
        return False
    if len(words) == 1 and words[0] == opp["type"].lower():
        return True  # "internships" → Internship
    text = _skill_text(opp)
    # Every word of the interest, as whole words (singular or plural), somewhere in the email's fields.
    return all(_mentions(text, w) or _mentions(text, w + "s") for w in words)


def explain_match(opp: dict, user: dict) -> dict:
    """
    `opp` needs title, type, skills, eligibility (summary and requirements are
    used too when present); `user` needs interests, skills, experienceLevel.
    """
    matched_skills = matched_skills_for(opp, user["skills"])
    if not user["skills"]:
        skills = "unknown"
    elif matched_skills:
        skills = "met"
    elif opp.get("skills"):
        skills = "unmet"
    else:
        skills = "unknown"  # the email names no skills: neutral, "Skills not mentioned in email"

    matched_interests = [i for i in user["interests"] if _interest_matches(i, opp)]
    if not user["interests"]:
        interests = "unknown"
    else:
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
        "unknown": {
            "ok": False,
            # The email listed skills but the profile has none, or the email names no skills at all.
            "label": "Add skills to your profile to compare" if opp["skills"] else "Skills not mentioned in email",
        },
    }[r["skills"]]
    interests = {
        "met": {"ok": True, "label": "Matches your interests", "detail": join(r["matchedInterests"])},
        "unmet": {"ok": False, "label": "Outside your listed interests"},
        "unknown": {"ok": False, "label": "Add interests to your profile to compare"},
    }[r["interests"]]
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
