"""
OpenAI Chat Completions with a strict JSON schema, behind the same interface
as Gemini. Not used unless AI_PROVIDER=openai (paid: needs OPENAI_API_KEY and
OPENAI_MODEL). Covered by unit tests with a mocked HTTP session only.
"""

import json

import requests

from ..schema import for_openai
from .base import AIError, DailyLimitReached, InvalidOutput, NotConfigured, RateLimited, TransientAIError

ENDPOINT = "https://api.openai.com/v1/chat/completions"
TIMEOUT = (10, 90)


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str, model: str, session: requests.Session | None = None):
        if not api_key or not model:
            raise NotConfigured("Set OPENAI_API_KEY and OPENAI_MODEL to use OpenAI.")
        self.model = model
        self._key = api_key
        self._http = session or requests.Session()

    def generate_json(self, system: str, prompt: str, schema: dict) -> dict:
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "extraction", "strict": True, "schema": for_openai(schema)},
            },
        }
        try:
            r = self._http.post(ENDPOINT, json=body, headers={"Authorization": f"Bearer {self._key}"}, timeout=TIMEOUT)
        except (requests.Timeout, requests.ConnectionError) as e:
            raise TransientAIError(f"OpenAI unreachable: {type(e).__name__}") from e

        if r.status_code == 200:
            try:
                msg = r.json()["choices"][0]["message"]
                if msg.get("refusal"):
                    raise InvalidOutput("The model refused.")
                out = json.loads(msg["content"])
            except (KeyError, IndexError, TypeError, ValueError) as e:
                raise InvalidOutput("Unexpected response shape.") from e
            if not isinstance(out, dict):
                raise InvalidOutput("JSON is not an object.")
            return out
        try:
            err = r.json().get("error", {})
        except ValueError:
            err = {}
        msg = str(err.get("message", r.text[:200]))
        if r.status_code == 429:
            if err.get("code") == "insufficient_quota":
                raise DailyLimitReached(msg)
            retry = r.headers.get("retry-after")
            raise RateLimited(msg, retry_after=float(retry) if retry and retry.replace(".", "", 1).isdigit() else None)
        if r.status_code in (401, 403):
            raise NotConfigured(f"OpenAI rejected the API key ({r.status_code}).")
        if r.status_code >= 500:
            raise TransientAIError(f"OpenAI {r.status_code}: {msg}")
        raise AIError(f"OpenAI {r.status_code}: {msg}")
