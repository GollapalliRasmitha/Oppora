"""
Fee detection: "Asks for a fee: ₹500".

Only the email's own words count. The AI must quote the sentence that states
the fee; the quote is kept only if it really appears in the email, talks about
paying, and isn't a negation ("no registration fee", "free of cost"). The
amount must appear in the quote. Nothing is ever inferred from who sent it.
"""

import re
from decimal import Decimal, InvalidOperation

#: Rule pre-scan: a sentence that mentions paying money. Used to decide whether a
#: (re-)check is worth an AI request at all.
FEE_WORDS = re.compile(
    r"\b(fees?|charges?|charged|payment|pay|paid|payable|deposit|refundable|registration amount|enrol?ment amount|"
    r"training cost|course fee|processing fee)\b",
    re.IGNORECASE,
)
MONEY = re.compile(
    r"(₹|\brs\.?|\binr\b|\$|\busd\b|€|\beur\b|£|\bgbp\b)\s?\d|\d[\d,]*(\.\d+)?\s?(/-|rupees|inr|usd|dollars)", re.IGNORECASE
)
NEGATION = re.compile(
    r"\b(no|zero|nil|without|waived|free of|not charge|never charge|doesn'?t charge|do not charge|don'?t charge)\b[^.!?\n]{0,40}"
    r"\b(fees?|charges?|cost|payment)\b|\bfree of (cost|charge)\b|\b(completely|absolutely|totally) free\b|\bno[- ]cost\b",
    re.IGNORECASE,
)
# Sentence ends: . ! ? followed by a space and a capital letter, or a line break. "Rs. 500/-" stays whole.
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'(])|\n+")
NUMBER = re.compile(r"\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?")
CURRENCY = [
    (re.compile(r"₹|\brs\.?|\binr\b|rupees", re.IGNORECASE), "INR"),
    (re.compile(r"\$|\busd\b|dollars", re.IGNORECASE), "USD"),
    (re.compile(r"€|\beur\b", re.IGNORECASE), "EUR"),
    (re.compile(r"£|\bgbp\b", re.IGNORECASE), "GBP"),
]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def fee_sentences(text: str) -> list[str]:
    """Sentences that mention paying (and aren't a "no fee" statement). Empty → no AI request needed."""
    out = []
    for s in _SENTENCE_END.split(text):
        s = s.strip()
        if s and FEE_WORDS.search(s) and not NEGATION.search(s):
            out.append(s[:300])
    return out


def validate_fee(raw, text: str) -> dict | None:
    """
    {"amount": Decimal | None, "currency": str, "text": str} when the email states a
    fee the reader has to pay, else None.
    """
    if not isinstance(raw, dict):
        return None
    quote = raw.get("quote")
    if not isinstance(quote, str) or len(quote.strip()) < 8:
        return None
    quote = re.sub(r"\s+", " ", quote).strip()[:300]
    if _norm(quote) not in _norm(text):
        return None  # not the email's words
    if not FEE_WORDS.search(quote) or NEGATION.search(quote):
        return None  # doesn't talk about paying, or says it's free

    numbers = {n.replace(",", "") for n in NUMBER.findall(quote)}
    amount = None
    if raw.get("amount") is not None:
        try:
            a = Decimal(str(raw["amount"]))
        except (InvalidOperation, ValueError):
            a = None
        # The amount must be written in the quote (e.g. "₹500" or "Rs. 1,499/-").
        if a is not None and a > 0 and any(Decimal(n) == a for n in numbers if n):
            amount = a
    if (
        amount is None
        and not MONEY.search(quote)
        and not re.search(r"\b(a|an|nominal|small|one-time)\s+(fee|charge)", quote, re.I)
    ):
        return None  # e.g. "pay attention" — no money involved

    currency = next((code for pattern, code in CURRENCY if pattern.search(quote)), "")
    if not currency and isinstance(raw.get("currency"), str) and re.fullmatch(r"[A-Z]{3}", raw["currency"].strip()):
        currency = raw["currency"].strip()
    return {"amount": amount, "currency": currency, "text": quote}


FEE_SCHEMA = {
    "type": "object",
    "nullable": True,
    "description": "Only when the email says the reader must pay (registration, application, training, "
    "certificate or security-deposit fee). Null if the email doesn't ask for money or says it's free.",
    "properties": {
        "amount": {"type": "number", "nullable": True, "description": "The amount, as written in the email."},
        "currency": {"type": "string", "nullable": True, "description": "ISO 4217 code, e.g. INR, USD."},
        "quote": {"type": "string", "description": "The exact sentence from the email that states the fee."},
    },
    "required": ["amount", "currency", "quote"],
}

#: Score penalty for opportunities that ask for money ("rank these lower").
FEE_PENALTY = 25
