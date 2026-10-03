"""
The one small interface every AI provider implements. The pipeline only
calls `generate_json`; switching providers is a setting (AI_PROVIDER).
"""

from typing import Protocol


class AIError(Exception):
    """Base class for provider errors."""


class NotConfigured(AIError):
    """No API key, or the key was rejected. Emails stay queued until it's fixed."""


class RateLimited(AIError):
    """HTTP 429 per-minute limit. `retry_after` (seconds) when the provider says how long to wait."""

    def __init__(self, message: str = "Rate limited", retry_after: float | None = None):
        super().__init__(message)
        self.retry_after = retry_after


class DailyLimitReached(AIError):
    """The free tier's requests-per-day quota is used up. Emails stay queued until it resets."""


class TransientAIError(AIError):
    """Timeouts and 5xx responses: worth retrying later."""

    def __init__(self, message: str = "Temporarily unavailable", overloaded: bool = False):
        super().__init__(message)
        #: The model itself is overloaded (e.g. Gemini 503 "high demand"): a fallback model may work now.
        self.overloaded = overloaded


class InvalidOutput(AIError):
    """The response wasn't JSON matching the schema (or was blocked). Retried once, then "needs review"."""


class AIProvider(Protocol):
    #: Short id used for usage accounting ("gemini", "openai", "fake").
    name: str
    #: Model id, stored with each classification.
    model: str

    def generate_json(self, system: str, prompt: str, schema: dict) -> dict:
        """
        One request: `system` instructions, the `prompt` (the email), and a JSON
        schema in the neutral format of ai.schema. Returns the parsed object or
        raises one of the errors above.
        """
        ...
