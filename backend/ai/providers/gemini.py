"""
Google Gemini via the REST generateContent endpoint (free tier, structured
JSON output). The key travels in the x-goog-api-key header, never the URL.
"""

import json
import re

import requests

from ..schema import for_gemini
from .base import AIError, DailyLimitReached, InvalidOutput, NotConfigured, RateLimited, TransientAIError

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT = (10, 90)  # connect, read (seconds)


def _retry_delay(err: dict) -> float | None:
    for d in err.get("details") or []:
        if str(d.get("@type", "")).endswith("RetryInfo") and (m := re.match(r"([\d.]+)s", str(d.get("retryDelay", "")))):
            return float(m.group(1))
    return None


def _is_daily(err: dict) -> bool:
    """429s carry QuotaFailure violations; a per-day quota id means waiting minutes won't help."""
    for d in err.get("details") or []:
        for v in d.get("violations") or []:
            if "PerDay" in str(v.get("quotaId", "")) or "per_day" in str(v.get("quotaMetric", "")).lower():
                return True
    return False


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str, model: str, session: requests.Session | None = None):
        if not api_key:
            raise NotConfigured("GEMINI_API_KEY is not set.")
        self.model = model
        self._key = api_key
        self._http = session or requests.Session()

    def generate_json(self, system: str, prompt: str, schema: dict) -> dict:
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
                "responseSchema": for_gemini(schema),
            },
        }
        try:
            r = self._http.post(
                ENDPOINT.format(model=self.model),
                json=body,
                headers={"x-goog-api-key": self._key, "Content-Type": "application/json"},
                timeout=TIMEOUT,
            )
        except (requests.Timeout, requests.ConnectionError) as e:
            raise TransientAIError(f"Gemini unreachable: {type(e).__name__}") from e

        if r.status_code == 200:
            return self._parse(r.json())
        try:
            err = r.json().get("error", {})
        except ValueError:
            err = {}
        msg = str(err.get("message", r.text[:200]))
        if r.status_code == 429:
            if _is_daily(err):
                raise DailyLimitReached(msg)
            raise RateLimited(msg, retry_after=_retry_delay(err))
        if r.status_code in (401, 403):
            raise NotConfigured(f"Gemini rejected the API key ({r.status_code}).")
        if r.status_code >= 500:
            overloaded = r.status_code == 503 or err.get("status") == "UNAVAILABLE"
            raise TransientAIError(f"Gemini {r.status_code}: {msg}", overloaded=overloaded)
        raise AIError(f"Gemini {r.status_code}: {msg}")

    @staticmethod
    def _parse(data: dict) -> dict:
        candidates = data.get("candidates") or []
        if not candidates:
            raise InvalidOutput(f"No answer (blocked: {data.get('promptFeedback', {}).get('blockReason', 'unknown')}).")
        parts = (candidates[0].get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        try:
            out = json.loads(text)
        except ValueError as e:
            raise InvalidOutput(f"Not JSON (finishReason={candidates[0].get('finishReason')}).") from e
        if not isinstance(out, dict):
            raise InvalidOutput("JSON is not an object.")
        return out
