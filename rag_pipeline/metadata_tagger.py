"""Step 3 (fallback): Use Groq's fast inference to backfill missing metadata.

Groq has no embeddings endpoint -- only chat/completions over models like
Llama and Gemma -- so it isn't used for vectorization. It's used here instead
because its low latency makes a per-record LLM call affordable across an
entire dataset, which is handy when the source JSON's System_Category /
Severity fields are missing, inconsistent, or free-text.
"""
import json
import os
from pathlib import Path
from typing import Dict

from groq import Groq

from groq_utils import TokenRateLimiter, call_with_backoff, estimate_tokens

_client = None
_rate_limiter = TokenRateLimiter()

# Persisted across runs so a crash (rate limit, network blip, Ctrl-C) only
# costs the one call that was in flight -- rerunning the build re-tags
# nothing that's already cached here instead of redoing all ~99 calls.
CACHE_PATH = Path(os.environ.get("GROQ_TAG_CACHE_PATH", "groq_tag_cache.json"))


def _load_disk_cache() -> Dict[str, Dict[str, str]]:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def _save_disk_cache(cache: Dict[str, Dict[str, str]]) -> None:
    CACHE_PATH.write_text(json.dumps(cache, indent=2), encoding="utf-8")


def _cache_key(system_category, fault_name) -> str:
    return f"{system_category}|{fault_name}"

VALID_CATEGORIES = ["Engine", "Electrical", "Brakes", "Transmission", "Fuel", "Cooling", "Other"]
VALID_SEVERITIES = ["Low", "Medium", "High", "Critical"]

TAGGING_PROMPT = """You are tagging an automotive diagnostic record with structured metadata.
Respond with ONLY a compact JSON object with exactly these two keys:
- "System_Category": one of {categories}
- "Severity": one of {severities}

Fault text:
\"\"\"{text}\"\"\"

JSON:"""


def _get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=os.environ["GROQ_API_KEY"])
    return _client


def infer_missing_metadata(text: str, model: str = "openai/gpt-oss-20b") -> Dict[str, str]:
    client = _get_client()
    prompt = TAGGING_PROMPT.format(
        categories=VALID_CATEGORIES,
        severities=VALID_SEVERITIES,
        text=text[:2000],
    )
    _rate_limiter.wait_for_budget(estimate_tokens(prompt, response_tokens=60))
    completion = call_with_backoff(
        client.chat.completions.create,
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        response_format={"type": "json_object"},
    )
    try:
        tags = json.loads(completion.choices[0].message.content)
        return {
            "System_Category": tags.get("System_Category", "Other"),
            "Severity": tags.get("Severity", "Unknown"),
        }
    except (json.JSONDecodeError, AttributeError, IndexError):
        return {"System_Category": "Other", "Severity": "Unknown"}


def backfill_metadata(docs, model: str = "openai/gpt-oss-20b"):
    """Mutates docs in place, only calling Groq for records missing real tags.

    Cached per (System_Category, Fault_Name) both in memory and on disk
    (CACHE_PATH): a fault's Symptoms and Diagnostic_Procedures sections are
    separate Documents but share one severity, so without the cache every
    fault would cost two identical Groq calls instead of one. The on-disk
    half means a rerun after a crash resumes instead of re-tagging
    everything -- only the fault that was mid-call needs a fresh request.
    """
    cache = _load_disk_cache()
    newly_tagged = False
    try:
        for doc in docs:
            needs_category = doc.metadata.get("System_Category") in (None, "", "Unclassified")
            needs_severity = doc.metadata.get("Severity") in (None, "", "Unknown")
            if not (needs_category or needs_severity):
                continue

            key = _cache_key(doc.metadata.get("System_Category"), doc.metadata.get("Fault_Name"))
            if key not in cache:
                cache[key] = infer_missing_metadata(doc.page_content, model=model)
                newly_tagged = True
                _save_disk_cache(cache)  # persist immediately -- survive a crash on the *next* call
            tags = cache[key]

            if needs_category:
                doc.metadata["System_Category"] = tags["System_Category"]
            if needs_severity:
                doc.metadata["Severity"] = tags["Severity"]
    finally:
        if newly_tagged:
            _save_disk_cache(cache)
    return docs
