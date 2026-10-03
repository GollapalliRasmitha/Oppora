"""
The extraction schema (PROMPT.md §7), written once in a neutral JSON-Schema
subset and converted for each provider:

- every property is listed in `required`; optional values are `"nullable": True`
- Gemini (responseSchema, OpenAPI subset) understands `nullable` directly
- OpenAI strict mode wants `"type": [..., "null"]` and `additionalProperties: false`
"""

import copy

from core.domain.constants import EMAIL_CATEGORIES, PRIORITIES

from .fees import FEE_SCHEMA


def _s(desc: str, nullable: bool = True, **extra) -> dict:
    return {"type": "string", "description": desc, "nullable": nullable, **extra}


def _list(desc: str) -> dict:
    return {"type": "array", "description": desc, "items": {"type": "string"}}


EXTRACTION_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "category": _s("What kind of email this is.", nullable=False, enum=list(EMAIL_CATEGORIES)),
        "is_opportunity": {
            "type": "boolean",
            "description": "True only for a concrete opportunity the reader can apply or register for, "
            "or an update about one (application received, reminder, interview invitation).",
        },
        "relevance": {"type": "integer", "description": "0-100: how relevant this is to the reader's interests."},
        "priority": _s("High, Medium or Low, based only on what the email says.", enum=list(PRIORITIES)),
        "summary": _s("One or two plain sentences saying what the email offers or asks, using only its content."),
        "organization": _s("The organization offering the opportunity, as written in the email."),
        "opportunity_name": _s("The opportunity's name as written in the email, e.g. 'Summer Internship 2027'."),
        "deadline": _s("Application/registration deadline as YYYY-MM-DD, only if the email states a date."),
        "eligibility": _s("Who can apply, as stated in the email."),
        "location": _s("Where it takes place (city, 'Remote', ...), as stated."),
        "duration": _s("How long it lasts, as stated."),
        "skills": _list("Skills or technologies the email explicitly asks for."),
        "requirements": _list("Requirements explicitly listed in the email."),
        "benefits": _list("Benefits explicitly listed (stipend, mentorship, ...)."),
        "application_link": _s("The URL to apply or register, copied exactly from the email."),
        "action_required": _s("What the reader has to do next, as stated."),
        "interview": {
            "type": "object",
            "nullable": True,
            "description": "Only when the email schedules an interview with a concrete date and time.",
            "properties": {
                "start": _s("ISO 8601 date-time with UTC offset.", nullable=False),
                "end": _s("ISO 8601 date-time with UTC offset, if the email gives an end or duration."),
                "location": _s("Video call, address, ... as stated."),
            },
            "required": ["start", "end", "location"],
        },
        "fee": FEE_SCHEMA,
        "confidence": {"type": "number", "description": "0-1: how sure you are about the extraction."},
    },
    "required": [
        "category", "is_opportunity", "relevance", "priority", "summary", "organization", "opportunity_name",
        "deadline", "eligibility", "location", "duration", "skills", "requirements", "benefits",
        "application_link", "action_required", "interview", "fee", "confidence",
    ],
}  # fmt: skip


def for_gemini(schema: dict) -> dict:
    """Gemini's responseSchema: drop nothing but keys it doesn't know."""
    s = copy.deepcopy(schema)

    def walk(node):
        node.pop("additionalProperties", None)
        for child in node.get("properties", {}).values():
            walk(child)
        if "items" in node:
            walk(node["items"])

    walk(s)
    return s


def for_openai(schema: dict) -> dict:
    """OpenAI strict JSON schema: nullable → type union, no extra properties."""
    s = copy.deepcopy(schema)

    def walk(node):
        if node.pop("nullable", False):
            node["type"] = [node["type"], "null"]
            if "enum" in node:
                node["enum"] = [*node["enum"], None]
        if "properties" in node:
            node["additionalProperties"] = False
            node["required"] = list(node["properties"])
            for child in node["properties"].values():
                walk(child)
        if "items" in node:
            walk(node["items"])

    walk(s)
    return s
