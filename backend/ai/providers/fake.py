"""A scripted provider for tests: returns queued responses or raises queued errors, and records calls."""

from collections import deque


class FakeProvider:
    name = "fake"
    model = "fake-1"

    def __init__(self, responses=()):
        self.responses = deque(responses)
        self.calls: list[dict] = []

    def push(self, *items):
        self.responses.extend(items)
        return self

    def generate_json(self, system: str, prompt: str, schema: dict) -> dict:
        self.calls.append({"system": system, "prompt": prompt, "schema": schema})
        if not self.responses:
            raise AssertionError("FakeProvider: no response queued")
        item = self.responses.popleft()
        if isinstance(item, Exception):
            raise item
        return item(prompt) if callable(item) else item
