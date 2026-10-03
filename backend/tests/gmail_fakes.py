"""Builders for Gmail API message dicts and a fake GmailClient (no network)."""

import base64
from email.utils import format_datetime


def b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def message(
    mid: str,
    *,
    subject: str,
    sender: str = "Careers Team <careers@acme.example>",
    text: str | None = None,
    html: str | None = None,
    attachment: str | None = None,
    labels=("INBOX", "UNREAD"),
    thread: str | None = None,
    sent=None,
) -> dict:
    from datetime import UTC, datetime

    sent = sent or datetime(2026, 10, 1, 10, 0, tzinfo=UTC)
    parts = []
    if text is not None:
        parts.append({"mimeType": "text/plain", "filename": "", "body": {"data": b64(text), "size": len(text)}})
    if html is not None:
        parts.append({"mimeType": "text/html", "filename": "", "body": {"data": b64(html), "size": len(html)}})
    if attachment is not None:
        # Gmail returns small attachments inline with a filename; Oppora must never read them.
        parts.append({"mimeType": "application/pdf", "filename": "brochure.pdf", "body": {"data": b64(attachment), "size": 10}})
    return {
        "id": mid,
        "threadId": thread or mid,
        "labelIds": list(labels),
        "snippet": (text or "")[:120],
        "internalDate": str(int(sent.timestamp() * 1000)),
        "payload": {
            "mimeType": "multipart/mixed",
            "headers": [
                {"name": "From", "value": sender},
                {"name": "Subject", "value": subject},
                {"name": "Date", "value": format_datetime(sent)},
            ],
            "parts": parts,
        },
    }


class FakeGmail:
    """Stands in for mail.gmail.GmailClient."""

    def __init__(self, messages=(), history="100"):
        self.messages = {m["id"]: m for m in messages}
        self.history = history
        self.added: list[str] = []
        self.gets: list[str] = []

    def add(self, *msgs):
        for m in msgs:
            self.messages[m["id"]] = m
            self.added.append(m["id"])
        self.history = str(int(self.history) + 1)

    def history_id(self):
        return self.history

    def recent_message_ids(self, days, limit):
        return list(self.messages)[:limit]

    def added_since(self, history_id, limit):
        out, self.added = self.added[:limit], []
        return out

    def get(self, mid):
        self.gets.append(mid)
        return self.messages.get(mid)
