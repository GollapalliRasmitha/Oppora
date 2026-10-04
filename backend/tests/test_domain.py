"""
Server-side domain logic, ported from the frontend tests (stats, insights,
calendar, assistant, match) and checked against the same seed.
"""

from datetime import datetime

import pytest

from core.domain.assistant import SUGGESTED_PROMPTS, answer_question
from core.domain.calendar import build_calendar_items
from core.domain.insights import compute_insights
from core.domain.match import explain_match, match_sentence
from core.domain.stats import build_recommendation, compute_dashboard_stats

from .conftest import DEMO_NOW, KOLKATA, exported_for

SEED = exported_for(DEMO_NOW.date())["seed"]
OPPS = SEED["opportunities"]
EMAILS = SEED["emails"]
IVS = SEED["interviews"]


def by_id(i):
    return next(o for o in OPPS if o["id"] == i)


def ask(q, ctx=None):
    return answer_question(q, {"opportunities": OPPS, "emails": EMAILS, "interviews": IVS}, DEMO_NOW, ctx)


# --- Match --------------------------------------------------------------------


def test_python_and_typescript_explain_every_match_the_same():
    user = SEED["user"]
    for o in OPPS:
        assert explain_match(o, user) == o["matchReasons"], o["id"]


def test_unmet_and_unknown_are_reported_honestly():
    r = explain_match({"title": "Data Analyst", "type": "Job", "skills": ["SQL"], "eligibility": None}, SEED["user"])
    assert (r["skills"], r["interests"], r["experience"]) == ("unmet", "unmet", "unknown")
    assert match_sentence(by_id("opp_amazon_frontend")["matchReasons"]) == (
        "This opportunity matches your profile because of your interest in frontend development and software engineering."
    )


# --- Stats --------------------------------------------------------------------


def test_stats_ignore_dismissed_and_handle_empty():
    opps = [{**o, "dismissed": o["id"] == "opp_amazon_frontend"} for o in OPPS]
    s = compute_dashboard_stats(opps, DEMO_NOW)
    assert (s["total"]["value"], s["deadlinesThisWeek"]["value"]) == (11, 3)
    assert compute_dashboard_stats([], DEMO_NOW)["total"]["value"] == 0
    assert "new strong matches" in build_recommendation([], DEMO_NOW)["message"]


# --- Insights -----------------------------------------------------------------


def test_insight_cards_trend_and_progress():
    ins = compute_insights(OPPS, EMAILS, DEMO_NOW)
    assert ins["mostCommonCategory"] == {"type": "Internship", "count": 4, "percent": 33, "tied": False}
    assert ins["topCompany"] == {"name": "Google", "count": 2, "tied": False}
    assert ins["trend"][-1]["date"] == "2026-10-02"
    assert [p["count"] for p in ins["trend"]] == [1, 1, 1, 2, 2, 3, 0]
    assert ins["trend"][-1]["label"] == "Fri" and ins["trend"][-1]["fullLabel"] == "Friday 2 October"
    assert ins["trendTotal"] == 10
    month = compute_insights(OPPS, EMAILS, DEMO_NOW, 30)
    assert len(month["trend"]) == 30 and month["trendTotal"] == 19 and month["trend"][0]["label"] == "3 Sept"
    assert ins["progress"] == {"applied": 8, "inProgress": 3, "saved": 1, "other": 0, "total": 12, "appliedPercent": 67}
    assert ins["recommendation"] == "Based on your profile, you have 3 opportunities worth reviewing this week."
    assert compute_insights([], [], DEMO_NOW)["recommendation"].startswith("Nothing new")


def test_ties_are_reported():
    tied = [o for o in OPPS if o["type"] in ("Hackathon", "Job")]
    assert compute_insights(tied, [], DEMO_NOW)["mostCommonCategory"]["tied"] is True


# --- Calendar -----------------------------------------------------------------


def test_calendar_items():
    items = build_calendar_items(OPPS, IVS, DEMO_NOW)
    assert {i["kind"] for i in items} == {"application", "hackathon", "scholarship", "interview", "reminder"}
    r = next(i for i in items if i["id"] == "reminder_opp_tcs_codevita_2026")
    assert r["date"] == "2026-10-03"
    assert datetime.fromisoformat(r["start"].replace("Z", "+00:00")).astimezone(KOLKATA).hour == 9
    iv = next(i for i in items if i["kind"] == "interview" and i["date"] == "2026-10-07")
    assert iv["title"] == "Technical interview — Atlassian"

    dismissed = [{**o, "dismissed": o["id"] == "opp_atlassian_swe_intern"} for o in OPPS]
    assert all(i["opportunityId"] != "opp_atlassian_swe_intern" for i in build_calendar_items(dismissed, IVS, DEMO_NOW))


# --- Assistant ----------------------------------------------------------------


def test_the_five_prompts():
    assert SUGGESTED_PROMPTS == [
        "Find internships for me",
        "What deadlines are approaching?",
        "Show high-priority opportunities",
        "Why is this opportunity relevant?",
        "What should I apply for this week?",
    ]
    a = ask("Find internships for me")
    assert a["text"] == "You have 3 open internships, best match first:"
    assert [link["href"] for link in a["links"]] == [
        "/opportunities/opp_google_summer_2027",
        "/opportunities/opp_microsoft_explore",
        "/opportunities/opp_atlassian_swe_intern",
    ]
    a = ask("What deadlines are approaching?")
    assert a["text"] == "4 deadlines are coming up in the next 7 days (2 within 3 days):"
    assert [link["title"] for link in a["links"]] == [
        "TCS CodeVita 2026",
        "Microsoft Explore",
        "Women Techmakers Scholarship",
        "Frontend Developer",
    ]
    assert [link["title"] for link in ask("Show high-priority opportunities")["links"]] == [
        "TCS CodeVita 2026",
        "Microsoft Explore",
        "Google Summer Internship 2027",
    ]
    assert [link["title"] for link in ask("What should I apply for this week?")["links"]] == [
        "TCS CodeVita 2026",
        "Microsoft Explore",
        "Frontend Developer",
        "Google Summer Internship 2027",
    ]


def test_why_relevant_uses_context_or_asks():
    a = ask("Why is this opportunity relevant?", {"opportunityId": "opp_amazon_frontend"})
    assert "Frontend Developer — 86% match." in a["text"]
    assert "✓ Matches your skills (TypeScript, React, CSS)" in a["text"]
    assert "⚠ Eligibility not mentioned in email" in a["text"]
    no_ctx = ask("Why is this opportunity relevant?")
    assert no_ctx["links"] == [] and "Why is TCS CodeVita 2026 relevant?" in no_ctx["followUps"]


def test_grounding():
    a = ask("tell me about amazon")
    assert "Frontend Developer — Amazon · Job." in a["text"] and "Status: not started." in a["text"]
    assert [link["subtitle"] for link in ask("any interviews coming up?")["links"]] == [
        "7 Oct 2026 · 14:00–14:45 · Video call",
        "11 Oct 2026 · 11:00 · location not mentioned in email",
    ]
    assert [link["title"] for link in ask("show emails from zoho")["links"]] == [
        "Your application is under review",
        "Junior Web Developer — Chennai",
    ]
    weather = ask("what's the weather in Paris?")
    assert weather["text"].startswith("I couldn't find that in your opportunities or emails") and weather["links"] == []
    empty = answer_question("Find internships for me", {"opportunities": [], "emails": [], "interviews": []}, DEMO_NOW)
    assert "hasn't found any opportunities" in empty["text"]


@pytest.mark.parametrize(
    "q", SUGGESTED_PROMPTS + ["show saved", "what have I applied to", "hackathons", "emails from google careers"]
)
def test_links_point_at_real_opportunities_or_the_inbox(q):
    real = {f"/opportunities/{o['id']}" for o in OPPS}
    for link in ask(q)["links"]:
        assert link["href"] in real or link["href"].startswith("/inbox?q=")


# --- Skills: synonyms, text, neutral when unknown -------------------------------------------

PROFILE = {
    "interests": ["machine learning", "internships"],
    "skills": ["ReactJS", "JS", "Node", "Python"],
    "experienceLevel": None,
}


def opp(**kw):
    base = {"title": "Intern", "type": "Internship", "skills": [], "eligibility": None, "summary": "", "requirements": []}
    return {**base, **kw}


def test_skills_match_synonyms_and_text_not_only_the_list():
    r = explain_match(opp(title="Frontend Intern (React.js)", summary="You'll write JavaScript and Node.js services."), PROFILE)
    assert r["skills"] == "met" and r["matchedSkills"] == ["ReactJS", "JS", "Node"]
    r = explain_match(opp(skills=["react", "typescript"]), PROFILE)
    assert r["matchedSkills"] == ["ReactJS"]
    r = explain_match(opp(requirements=["Strong Python 3 skills"]), PROFILE)
    assert r["matchedSkills"] == ["Python"]


def test_whole_words_only():
    r = explain_match(opp(summary="We build JavaScript tools."), {**PROFILE, "skills": ["Java"]})
    assert r["skills"] == "unknown"  # "java" isn't "javascript"; the email names no skills → neutral


def test_no_skills_in_the_email_is_neutral_not_a_miss():
    r = explain_match(opp(summary="Apply for our summer internship."), PROFILE)
    assert r["skills"] == "unknown" and r["matchedSkills"] == []
    r = explain_match(opp(skills=["Figma"]), PROFILE)
    assert r["skills"] == "unmet"  # the email lists skills and none are yours
    assert explain_match(opp(skills=["Figma"]), {**PROFILE, "skills": []})["skills"] == "unknown"


def test_any_interest_can_match_not_only_the_built_in_three():
    r = explain_match(opp(title="ML Research Intern", summary="Work on machine learning models."), PROFILE)
    assert r["matchedInterests"] == ["machine learning", "internships"]
    assert explain_match(opp(), {**PROFILE, "interests": []})["interests"] == "unknown"


def test_checklist_wording_for_unknown_checks():
    from core.domain.match import match_checklist

    o = {**opp(summary="Apply now."), "deadline": None, "matchReasons": explain_match(opp(summary="Apply now."), PROFILE)}
    labels = [c["label"] for c in match_checklist(o, DEMO_NOW)]
    assert "Skills not mentioned in email" in labels
    o2 = {
        **opp(skills=["Go"]),
        "deadline": None,
        "matchReasons": explain_match(opp(skills=["Go"]), {**PROFILE, "skills": [], "interests": []}),
    }
    labels = [c["label"] for c in match_checklist(o2, DEMO_NOW)]
    assert "Add skills to your profile to compare" in labels and "Add interests to your profile to compare" in labels


def test_skill_alias_tables_are_identical_in_backend_and_frontend():
    import json
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    back = json.loads((root / "backend/core/domain/skill_aliases.json").read_text(encoding="utf-8"))
    front = json.loads((root / "frontend/lib/domain/skill-aliases.json").read_text(encoding="utf-8"))
    assert back == front
