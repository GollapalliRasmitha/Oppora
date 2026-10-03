"""
Oppora AI, grounded answers (port of frontend/lib/domain/assistant.ts).

Every answer is built only from the user's own stored opportunities, emails
and interviews, links to what it mentions, and says so plainly when the data
doesn't contain the answer. Stage 8 puts the LLM in front of this, keeping
the same grounding contract; these deterministic answers remain the fallback.
"""

import re
from urllib.parse import quote

from .constants import SOON_WINDOW_DAYS
from .dates import days_left, days_left_label, format_date, local_date, parse_dt, short_date, time_label
from .match import match_checklist, match_sentence
from .stats import strong_matches

SUGGESTED_PROMPTS = [
    "Find internships for me",
    "What deadlines are approaching?",
    "Show high-priority opportunities",
    "Why is this opportunity relevant?",
    "What should I apply for this week?",
]

STATUS = {"applied": "Applied", "in_progress": "In progress"}

TYPE_WORDS = [
    (r"\bintern(ship)?s?\b", "Internship"),
    (r"\bhackathons?\b", "Hackathon"),
    (r"\bjobs?\b|\broles?\b", "Job"),
    (r"\bscholarships?\b", "Scholarship"),
    (r"\bcompetitions?\b|\bcontests?\b", "Competition"),
    (r"\bfellowships?\b", "Fellowship"),
    (r"\bevents?\b|\bworkshops?\b", "Event"),
]
TYPE_PLURAL = {
    "Internship": "internships",
    "Job": "jobs",
    "Hackathon": "hackathons",
    "Scholarship": "scholarships",
    "Competition": "competitions",
    "Fellowship": "fellowships",
    "Event": "events",
}

INF = float("inf")


def _answer(text: str, links=None, follow_ups=None) -> dict:
    return {"text": text, "links": links or [], "followUps": follow_ups or []}


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def _opp_link(o: dict, now) -> dict:
    parts = [f"{o['organization']} · {o['type']}", days_left_label(days_left(o["deadline"], now)), f"{o['matchScore']}% match"]
    if o["application"]:
        parts.append(STATUS[o["application"]["status"]])
    return {"href": f"/opportunities/{o['id']}", "title": o["title"], "subtitle": " · ".join(parts)}


def _is_open(o: dict, now) -> bool:
    d = days_left(o["deadline"], now)
    return d is None or d >= 0


def _by_deadline(now):
    def key(o):
        d = days_left(o["deadline"], now)
        return INF if d is None else d

    return key


def _by_match(o):
    return -o["matchScore"]


def _mentioned(q: str, opps: list[dict]) -> list[dict]:
    """Opportunities the question names by title or organization."""
    by_title = [o for o in opps if o["title"].lower() in q]
    if by_title:
        return by_title
    title_words = []
    for o in opps:
        key = " ".join(o["title"].lower().split()[:2])
        if len(key) > 5 and key in q:
            title_words.append(o)
    if title_words:
        return title_words
    return [o for o in opps if re.search(rf"\b{re.escape(o['organization'].lower())}\b", q)]


def _explain(o: dict, now) -> dict:
    checks = "\n".join(
        f"{'✓' if c['ok'] else '⚠'} {c['label']}{f' ({c["detail"]})' if c.get('detail') else ''}" for c in match_checklist(o, now)
    )
    return _answer(
        f"{o['title']} — {o['matchScore']}% match. {match_sentence(o['matchReasons'])}\n\n{checks}", [_opp_link(o, now)]
    )


def _summarize(o: dict, now) -> str:
    d = days_left(o["deadline"], now)
    deadline = f"{format_date(o['deadline'])} ({days_left_label(d)})" if o["deadline"] else "not mentioned in email"
    status = STATUS[o["application"]["status"]] if o["application"] else "not started"
    lines = [
        f"{o['title']} — {o['organization']} · {o['type']}.",
        f"Deadline: {deadline}. Status: {status}. Priority: {o['priority']}. Match: {o['matchScore']}%.",
        f"From the email: {o['summary']}" if o["summary"] else "",
    ]
    return "\n".join(line for line in lines if line)


def _list(title: str, items: list[dict], now, empty: str) -> dict:
    return _answer(title, [_opp_link(o, now) for o in items]) if items else _answer(empty)


def answer_question(question: str, data: dict, now, ctx: dict | None = None) -> dict:
    ctx = ctx or {}
    q = question.strip().lower()
    opps = [o for o in data["opportunities"] if not o["dismissed"]]
    open_ = [o for o in opps if _is_open(o, now)]

    if not opps:
        return _answer(
            "Oppora hasn't found any opportunities in your Gmail yet, so I have nothing to answer from. "
            "Run a Gmail scan and ask me again."
        )

    named = _mentioned(q, opps)

    # "Why is … relevant?"
    if re.search(r"\bwhy\b", q) and re.search(r"relevant|match|recommend|good fit|fit", q):
        target = None
        if len(named) == 1:
            target = named[0]
        elif not named and ctx.get("opportunityId"):
            target = next((o for o in opps if o["id"] == ctx["opportunityId"]), None)
        if target:
            return _explain(target, now)
        choices = (named or strong_matches(opps, now))[:3]
        return _answer(
            "More than one opportunity matches that. Which one do you mean?"
            if named
            else "Which opportunity do you mean? Open one and ask again, or pick one of these:",
            follow_ups=[f"Why is {o['title']} relevant?" for o in choices],
        )

    # "What should I apply for this week?"
    if re.search(r"\bapply\b", q) and re.search(r"week|should|next|now|today", q):
        soon = [
            o
            for o in open_
            if (not o["application"] or o["application"]["status"] != "applied")
            and (d := days_left(o["deadline"], now)) is not None
            and d <= SOON_WINDOW_DAYS
        ]
        soon_ids = {o["id"] for o in soon}
        strong = [o for o in strong_matches(opps, now) if o["id"] not in soon_ids]
        picks = sorted(soon, key=_by_deadline(now)) + sorted(strong, key=_by_match)
        extra = f", and {_plural(len(strong), 'other strong match is', 'other strong matches are')} still open" if strong else ""
        return _list(
            _plural(len(soon), "opportunity you haven't applied to closes", "opportunities you haven't applied to close")
            + f" in the next {SOON_WINDOW_DAYS} days{extra}. Start with the ones closing soonest:",
            picks,
            now,
            "Nothing needs applying this week: you've applied to everything that closes in the next 7 days, "
            "and there are no other open strong matches.",
        )

    # Deadlines
    if re.search(r"deadline|due|closing|close soon|expir", q):
        soon = sorted([o for o in open_ if _by_deadline(now)(o) <= SOON_WINDOW_DAYS], key=_by_deadline(now))
        if soon:
            urgent = sum(1 for o in soon if _by_deadline(now)(o) <= 3)
            return _list(
                f"{_plural(len(soon), 'deadline is', 'deadlines are')} coming up in the next {SOON_WINDOW_DAYS} days"
                + (f" ({urgent} within 3 days)" if urgent else "")
                + ":",
                soon,
                now,
                "",
            )
        dated = sorted([o for o in open_ if o["deadline"]], key=_by_deadline(now))
        if dated:
            nxt = dated[0]
            return _answer(
                f"No deadlines in the next {SOON_WINDOW_DAYS} days. The next one is {nxt['title']} on {format_date(nxt['deadline'])}.",
                [_opp_link(nxt, now)],
            )
        return _answer("None of your open opportunities has a deadline mentioned in its email.")

    # High priority
    if re.search(r"high[- ]priority|important|priority", q):
        high = sorted([o for o in open_ if o["priority"] == "High"], key=_by_deadline(now))
        return _list(
            f"{_plural(len(high), 'high-priority opportunity is', 'high-priority opportunities are')} still open:",
            high,
            now,
            "You don't have any open high-priority opportunities right now.",
        )

    # Interviews
    if "interview" in q:
        by_id = {o["id"]: o for o in opps}
        upcoming = sorted(
            [iv for iv in data["interviews"] if parse_dt(iv["end"] or iv["start"]) >= now and iv["opportunityId"] in by_id],
            key=lambda iv: parse_dt(iv["start"]),
        )
        if not upcoming:
            return _answer("I couldn't find any upcoming interviews in your emails.")
        links = []
        for iv in upcoming:
            end = f"–{time_label(iv['end'], now)}" if iv["end"] else ""
            when = f"{format_date(local_date(iv['start'], now))} · {time_label(iv['start'], now)}{end}"
            links.append(
                {
                    "href": f"/opportunities/{iv['opportunityId']}",
                    "title": iv["title"],
                    "subtitle": f"{when} · {iv['location'] or 'location not mentioned in email'}",
                }
            )
        return _answer(f"You have {_plural(len(upcoming), 'upcoming interview', 'upcoming interviews')}:", links)

    # Emails from someone
    m = re.search(r"emails? (?:from|by) ([a-z0-9 .&-]+)", q)
    if m:
        who = m.group(1).strip()
        found = [e for e in data["emails"] if not e["archived"] and who in e["sender"].lower()]
        if not found:
            return _answer(f'I couldn\'t find any emails from "{who}" in your inbox.')
        return _answer(
            f"{_plural(len(found), 'email', 'emails')} from {found[0]['sender']}:",
            [
                {
                    "href": f"/opportunities/{e['opportunityId']}"
                    if e["opportunityId"]
                    else f"/inbox?q={quote(e['subject'], safe='')}",
                    "title": e["subject"],
                    "subtitle": f"{e['sender']} · {short_date(local_date(e['receivedAt'], now))}",
                }
                for e in found[:6]
            ],
        )

    # Status lists
    if re.search(r"\bsaved\b", q):
        return _list(
            "Your saved opportunities:",
            sorted([o for o in opps if o["saved"]], key=_by_deadline(now)),
            now,
            "You haven't saved any opportunities yet.",
        )
    if re.search(r"\bapplied\b", q):
        return _list(
            "You've applied to these:",
            [o for o in opps if o["application"] and o["application"]["status"] == "applied"],
            now,
            "You haven't marked anything as applied yet.",
        )
    if re.search(r"in progress|started", q):
        return _list(
            "Applications in progress:",
            [o for o in opps if o["application"] and o["application"]["status"] == "in_progress"],
            now,
            "You don't have any applications in progress.",
        )

    # A specific opportunity
    if len(named) == 1:
        o = named[0]
        return _answer(_summarize(o, now), [_opp_link(o, now)], [f"Why is {o['title']} relevant?"])
    if len(named) > 1:
        return _list("I found these matching opportunities:", named, now, "")

    # By type ("Find internships for me")
    opp_type = next((t for pattern, t in TYPE_WORDS if re.search(pattern, q)), None)
    if opp_type:
        items = sorted([o for o in open_ if o["type"] == opp_type], key=_by_match)
        word = TYPE_PLURAL[opp_type]
        return _list(
            f"You have {_plural(len(items), 'open ' + word.removesuffix('s'), 'open ' + word)}, best match first:",
            items,
            now,
            f"I couldn't find any open {word} in your opportunities.",
        )

    if re.search(r"match|recommend|best|suggest", q):
        return _list(
            "Your strongest matches that are still open:",
            sorted(strong_matches(opps, now), key=_by_match),
            now,
            "You don't have any strong matches open right now.",
        )

    return _answer(
        "I couldn't find that in your opportunities or emails. I can only answer from what Oppora found in your Gmail — try one of these:",
        follow_ups=SUGGESTED_PROMPTS[:3],
    )
