"""Shared Groq call wrapper: back off and retry on rate limits.

This account's Groq tier caps out around 7500 tokens/minute. metadata_tagger.py
makes up to ~99 sequential calls building the vector store, which comfortably
exceeds that in under a minute without pacing, so every Groq call in this
project routes through here instead of calling the SDK directly.
"""
import time

from groq import APIConnectionError, APITimeoutError, InternalServerError, RateLimitError

DEFAULT_MAX_RETRIES = 5
DEFAULT_BACKOFF_SECONDS = 60
TRANSIENT_BACKOFF_SECONDS = 5  # for 5xx/connection errors, unrelated to rate limits
TOKENS_PER_MINUTE_BUDGET = 7500  # this account's Groq tier cap
TRANSIENT_ERRORS = (InternalServerError, APIConnectionError, APITimeoutError)


class TokenRateLimiter:
    """Proactively paces calls to stay under a tokens/minute budget.

    metadata_tagger.py fires up to ~99 calls in a tight loop, which would
    blow past a 7500 TPM cap almost immediately without this -- better to
    slow down ahead of time than to hit 429s and back off reactively.
    """

    def __init__(self, tokens_per_minute: int = TOKENS_PER_MINUTE_BUDGET):
        self.tokens_per_minute = tokens_per_minute
        self._events = []  # list of (timestamp, tokens) within the trailing 60s

    def wait_for_budget(self, estimated_tokens: int) -> None:
        now = time.time()
        self._events = [(t, tok) for t, tok in self._events if now - t < 60]
        used = sum(tok for _, tok in self._events)

        if used + estimated_tokens > self.tokens_per_minute and self._events:
            sleep_seconds = 60 - (now - self._events[0][0]) + 0.5
            if sleep_seconds > 0:
                print(f"Approaching Groq's {self.tokens_per_minute} TPM budget; waiting {sleep_seconds:.1f}s...")
                time.sleep(sleep_seconds)
            now = time.time()
            self._events = [(t, tok) for t, tok in self._events if now - t < 60]

        self._events.append((now, estimated_tokens))


def estimate_tokens(*texts: str, response_tokens: int = 100) -> int:
    """Rough chars/4 estimate -- good enough for pacing, not billing."""
    return sum(len(t) for t in texts) // 4 + response_tokens


def call_with_backoff(fn, *args, max_retries: int = DEFAULT_MAX_RETRIES, **kwargs):
    """Call fn(*args, **kwargs); retry with backoff on rate limits or transient
    server/connection errors (e.g. a Groq 503 during an outage)."""
    for attempt in range(1, max_retries + 1):
        try:
            return fn(*args, **kwargs)
        except RateLimitError as e:
            if attempt == max_retries:
                raise
            wait_seconds = _retry_after_seconds(e) or DEFAULT_BACKOFF_SECONDS
            print(f"Groq rate limit hit (attempt {attempt}/{max_retries}); waiting {wait_seconds}s before retrying...")
            time.sleep(wait_seconds)
        except TRANSIENT_ERRORS as e:
            if attempt == max_retries:
                raise
            wait_seconds = TRANSIENT_BACKOFF_SECONDS * attempt
            print(
                f"Groq transient error ({type(e).__name__}, attempt {attempt}/{max_retries}); "
                f"waiting {wait_seconds}s before retrying..."
            )
            time.sleep(wait_seconds)


def _retry_after_seconds(error: RateLimitError):
    """Prefer the server's own Retry-After header over our fixed default."""
    try:
        header = error.response.headers.get("retry-after")
        return float(header) if header is not None else None
    except AttributeError:
        return None
