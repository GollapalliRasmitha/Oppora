"""
Removes personal details from text before it's sent to the AI (Gemini's free
tier may be reviewed by people at Google). Applied to everything AI-bound: the
subject, sender, email text and fee sentences.

Removed:
- email addresses                         → [email]
- phone numbers (10-15 digits)            → [phone]
- OTPs and verification / login codes     → [code]
- secrets in links: token-like query
  parameters and the token parts of
  sign-in / reset / verify links          → [token]
- the user's name (full name and each part) → [name]

Dates, amounts ("₹1,499"), years and ordinary links (job pages, Google Forms)
are left alone, so the AI can still find deadlines, fees and application links.
"""

import re
from dataclasses import dataclass, field
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}")
URL = re.compile(r"https?://[^\s<>()\"']+")
# A run of digits with phone-style separators; the digit count is checked afterwards.
PHONE = re.compile(r"(?<![\w/:.,-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,5}\)[\s.-]?)?\d[\d\s.-]{6,18}\d(?![\w/:])")
_DATE_LIKE = re.compile(r"^\d{4}[-.]\d{1,2}[-.]\d{1,2}$|^\d{1,2}[-.]\d{1,2}[-.]\d{2,4}$")
CODE_LABEL = re.compile(
    r"(?i)\b(otp|one[- ]time (?:password|passcode|code|pin)|verification code|security code|confirmation code|"
    r"login code|sign[- ]in code|access code|auth(?:entication)? code|passcode|pin|code)\b"
    r"(\s*(?:is|:|-|=|#)?\s*)([A-Za-z0-9]{4,10}|\d{3}[ -]\d{3})\b"
)
CODE_IS_YOUR = re.compile(r"(?i)\b([A-Za-z0-9]{4,10}|\d{3}[ -]\d{3})\b(?=\s+is\s+your\b)")
SENSITIVE_PARAM = re.compile(
    r"(?i)^(token|access_token|id_token|refresh_token|auth|authorization|code|otp|key|api_?key|sig|signature|"
    r"session|sid|password|pass|pwd|secret|reset|verify|verification|confirm|magic|login_token|jwt|hash|ticket|"
    r"email|e|uid|user_?id|recipient)$"
)
AUTH_PATH = re.compile(
    r"(?i)(reset|verify|verification|confirm|unsubscribe|login|signin|sign-in|auth|magic|token|activate|invite|password|otp)"
)
SECRETISH = re.compile(r"^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9_\-.~%=]{20,}$")


@dataclass
class Redacted:
    text: str
    #: Cleaned link → original link, so a cleaned application link still counts as "in the email".
    urls: dict[str, str] = field(default_factory=dict)


def _clean_url(url: str) -> str:
    trail = ""
    while url and url[-1] in ").,;:!?'\"":
        url, trail = url[:-1], url[-1] + trail
    parts = urlsplit(url)
    query = []
    for k, v in parse_qsl(parts.query, keep_blank_values=True):
        if SENSITIVE_PARAM.match(k) or SECRETISH.match(v) or EMAIL.search(v):
            query.append((k, "[token]"))
        else:
            query.append((k, v))
    path = parts.path
    if AUTH_PATH.search(parts.netloc + parts.path):  # sign-in / reset / verify links: hide the token parts
        path = "/".join("[token]" if SECRETISH.match(seg) else seg for seg in path.split("/"))
    q = urlencode(query, safe="[]") if query else ""
    return urlunsplit((parts.scheme, parts.netloc, path, q, "")) + trail


def _phone(m: re.Match) -> str:
    s = m.group(0)
    digits = sum(ch.isdigit() for ch in s)
    if not 10 <= digits <= 15 or _DATE_LIKE.match(s.strip()):
        return s
    return "[phone]"


def _code(m: re.Match) -> str:
    label, sep, code = m.group(1), m.group(2), m.group(3)
    return f"{label}{sep}[code]" if any(ch.isdigit() for ch in code) else m.group(0)


def _name_pattern(name: str | None) -> re.Pattern | None:
    words = [w for w in re.split(r"\s+", (name or "").strip()) if w]
    parts = [w for w in words if len(w) >= 2]  # single initials alone would match too much
    if not parts:
        return None
    full = r"\s+".join(re.escape(w) for w in words)  # the whole name, initials included, first
    alternatives = [full, *sorted({re.escape(p) for p in parts}, key=len, reverse=True)]
    return re.compile(r"(?i)(?<![\w@])(" + "|".join(alternatives) + r")(?![\w])")


def redact(text: str, user_name: str | None = None) -> Redacted:
    """Text with personal details replaced by placeholders (see the module docstring)."""
    if not text:
        return Redacted(text or "")
    urls: dict[str, str] = {}

    def url(m: re.Match) -> str:
        original = m.group(0)
        cleaned = _clean_url(original)
        if cleaned != original:
            urls[cleaned.rstrip(").,;:!?'\"")] = original.rstrip(").,;:!?'\"")
        return cleaned

    out = URL.sub(url, text)  # first, so the rules below don't mangle links
    # Protect cleaned links from the remaining rules.
    links: list[str] = []

    def stash(m: re.Match) -> str:
        links.append(m.group(0))
        return f"\x00{len(links) - 1}\x00"

    out = URL.sub(stash, out)
    out = EMAIL.sub("[email]", out)
    out = CODE_LABEL.sub(_code, out)
    out = CODE_IS_YOUR.sub(lambda m: "[code]" if any(ch.isdigit() for ch in m.group(1)) else m.group(0), out)
    out = PHONE.sub(_phone, out)
    if pattern := _name_pattern(user_name):
        out = pattern.sub("[name]", out)
    out = re.sub(r"\x00(\d+)\x00", lambda m: links[int(m.group(1))], out)
    return Redacted(out, urls)


def sender_for_ai(name: str, email: str, user_name: str | None = None) -> str:
    """The sender without its address: the display name plus the domain (it helps name the organization)."""
    domain = email.rsplit("@", 1)[-1] if "@" in (email or "") else ""
    shown = redact(name or "", user_name).text
    return f"{shown} ({domain})" if domain else shown
