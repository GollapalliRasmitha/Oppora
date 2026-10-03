"""
Turns a Gmail API message (format=full) into the minimum the pipeline needs:
headers we store, plus a cleaned, trimmed plain-text body that is sent to the
AI and then discarded. Attachments are never read (parts with a filename or
attachmentId are skipped) and full bodies are never stored.
"""

import base64
import html
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.utils import getaddresses, parsedate_to_datetime
from html.parser import HTMLParser

SNIPPET_CHARS = 300


@dataclass
class MessageContent:
    message_id: str
    thread_id: str
    sender_name: str
    sender_email: str
    subject: str
    received_at: datetime
    labels: list[str]
    #: Cleaned plain text (links kept as "text (url)"), already trimmed.
    body: str
    snippet: str
    list_unsubscribe: bool = False
    urls: list[str] = field(default_factory=list)


class _TextFromHTML(HTMLParser):
    """Readable text from email HTML; keeps link targets, drops scripts/styles/images."""

    BLOCK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "table", "section", "article"}
    SKIP = {"script", "style", "head", "title", "noscript"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self._skip = 0
        self._href: list[str | None] = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip += 1
        elif tag == "a":
            self._href.append(dict(attrs).get("href"))
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self._skip = max(0, self._skip - 1)
        elif tag == "a" and self._href:
            href = self._href.pop()
            if href and href.startswith(("http://", "https://")):
                self.out.append(f" ({href})")
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.out.append(data)


def html_to_text(markup: str) -> str:
    p = _TextFromHTML()
    p.feed(markup)
    p.close()
    return html.unescape("".join(p.out))


def _decode(data: str) -> str:
    raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
    return raw.decode("utf-8", errors="replace")


def _text_parts(part: dict, plain: list[str], rich: list[str]) -> None:
    """Collects text/plain and text/html bodies, skipping attachments entirely."""
    body = part.get("body") or {}
    if part.get("filename") or body.get("attachmentId"):
        return  # an attachment: never downloaded, never read
    mime = part.get("mimeType", "")
    if mime == "text/plain" and body.get("data"):
        plain.append(_decode(body["data"]))
    elif mime == "text/html" and body.get("data"):
        rich.append(_decode(body["data"]))
    for child in part.get("parts") or []:
        _text_parts(child, plain, rich)


# Reply quotes only. Forwarded messages are kept: a forwarded internship email is the content we want.
_QUOTE_START = re.compile(r"^(On .{5,200} wrote:|-----Original Message-----)$", re.M)
_SIGNATURE = re.compile(r"^(-- ?|__+|Sent from my \w+.*)$", re.M)
_URL = re.compile(r"https?://[^\s<>()\"']+")


def clean_text(text: str, limit: int) -> str:
    """Removes quoted replies, signatures and noise, collapses whitespace, trims to `limit`."""
    text = text.replace("\r\n", "\n").replace("‌", "").replace("\xa0", " ")
    if m := _QUOTE_START.search(text):
        text = text[: m.start()]
    if m := _SIGNATURE.search(text):
        text = text[: m.start()]
    lines = [ln.strip() for ln in text.split("\n") if not ln.lstrip().startswith(">")]
    text = "\n".join(ln for ln in lines if ln)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) > limit:
        cut = text[:limit]
        text = cut[: cut.rfind(" ")] if " " in cut[-50:] else cut
        text += " …"
    return text


def parse_message(msg: dict, max_body_chars: int) -> MessageContent:
    payload = msg.get("payload") or {}
    headers = {h["name"].lower(): h["value"] for h in payload.get("headers") or []}
    name, addr = (getaddresses([headers.get("from", "")]) or [("", "")])[0]

    try:
        received = parsedate_to_datetime(headers["date"]) if "date" in headers else None
    except (TypeError, ValueError):
        received = None
    if received is None or received.tzinfo is None:
        received = datetime.fromtimestamp(int(msg.get("internalDate", "0")) / 1000, tz=UTC)

    plain: list[str] = []
    rich: list[str] = []
    _text_parts(payload, plain, rich)
    raw = "\n".join(plain) if plain else html_to_text("\n".join(rich))
    body = clean_text(raw, max_body_chars)
    snippet = clean_text(html.unescape(msg.get("snippet", "")) or body, SNIPPET_CHARS)

    return MessageContent(
        message_id=msg["id"],
        thread_id=msg.get("threadId", ""),
        sender_name=(name or addr.split("@")[0]).strip()[:200],
        sender_email=addr.strip().lower()[:254],
        subject=(headers.get("subject") or "(no subject)").strip()[:300],
        received_at=received.astimezone(UTC),
        labels=list(msg.get("labelIds") or []),
        body=body,
        snippet=snippet,
        list_unsubscribe="list-unsubscribe" in headers,
        urls=list(dict.fromkeys(_URL.findall(body))),
    )
