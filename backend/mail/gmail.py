"""
Read-only Gmail access for one user (scope gmail.readonly only). Refreshes the
access token as needed and stores the new one encrypted. Any auth failure
(revoked access, the 7-day Testing-mode refresh-token expiry, a password
change) raises GmailAuthError so the connection becomes "Needs reconnect".
"""

from datetime import UTC

from django.conf import settings
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from accounts.models import GmailConnection

TOKEN_URI = "https://oauth2.googleapis.com/token"
#: Messages Oppora never looks at.
BASE_QUERY = "-in:chats -in:spam -in:trash -in:sent -in:drafts"


class GmailAuthError(Exception):
    pass


class HistoryExpired(Exception):
    """The stored historyId is too old for incremental sync; do a full scan instead."""


def _status(e: HttpError) -> int:
    return int(getattr(e.resp, "status", 0) or 0)


class GmailClient:
    def __init__(self, service):
        self._svc = service

    @classmethod
    def for_connection(cls, g: GmailConnection) -> "GmailClient":
        refresh = g.refresh_token
        if not refresh:
            raise GmailAuthError("No refresh token stored.")
        creds = Credentials(
            token=g.access_token,
            refresh_token=refresh,
            token_uri=TOKEN_URI,
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
            scopes=[settings.GMAIL_SCOPE],
            expiry=g.token_expiry.replace(tzinfo=None) if g.token_expiry else None,  # google-auth uses naive UTC
        )
        if not creds.valid:
            try:
                creds.refresh(Request())
            except RefreshError as e:
                raise GmailAuthError(str(e)) from e
            g.set_tokens(
                refresh_token=None, access_token=creds.token, expiry=creds.expiry.replace(tzinfo=UTC) if creds.expiry else None
            )
            g.save(update_fields=["access_token_enc", "token_expiry"])
        return cls(build("gmail", "v1", credentials=creds, cache_discovery=False))

    def _run(self, request):
        try:
            return request.execute(num_retries=3)  # retries 429/5xx with backoff
        except RefreshError as e:
            raise GmailAuthError(str(e)) from e
        except HttpError as e:
            if _status(e) in (401, 403):
                raise GmailAuthError(f"Gmail refused access ({_status(e)}).") from e
            raise

    def history_id(self) -> str:
        return str(self._run(self._svc.users().getProfile(userId="me"))["historyId"])

    def recent_message_ids(self, days: int, limit: int) -> list[str]:
        """Newest first, at most `limit`."""
        ids, token = [], None
        while len(ids) < limit:
            page = self._run(
                self._svc.users()
                .messages()
                .list(userId="me", q=f"newer_than:{days}d {BASE_QUERY}", maxResults=min(100, limit - len(ids)), pageToken=token)
            )
            ids += [m["id"] for m in page.get("messages", [])]
            token = page.get("nextPageToken")
            if not token:
                break
        return ids

    def added_since(self, history_id: str, limit: int) -> list[str]:
        """Message ids added since `history_id` (incremental sync)."""
        ids, token = [], None
        try:
            while len(ids) < limit:
                page = self._run(
                    self._svc.users()
                    .history()
                    .list(userId="me", startHistoryId=history_id, historyTypes=["messageAdded"], pageToken=token)
                )
                for h in page.get("history", []):
                    ids += [a["message"]["id"] for a in h.get("messagesAdded", [])]
                token = page.get("nextPageToken")
                if not token:
                    break
        except HttpError as e:
            if _status(e) == 404:
                raise HistoryExpired() from e
            raise
        return list(dict.fromkeys(ids))[:limit]

    def get(self, message_id: str) -> dict | None:
        """The message (format=full: headers + text parts; attachments are not downloaded). None if it's gone."""
        try:
            return self._run(self._svc.users().messages().get(userId="me", id=message_id, format="full"))
        except HttpError as e:
            if _status(e) == 404:
                return None
            raise
