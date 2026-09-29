"""Final answer: deterministic facts + Groq reasoning, with sources and SPNs enforced.

Answer layout (7 sections):
  1. Fault Code Analysis            built in Python from the J1939 database (no LLM)
  2. Symptom Analysis               written by Groq under strict evidence rules;
  3. Combined Analysis              section 3 must contain exactly one
  4. Supported/Potential Causes     "**Relationship:** <A|B|C|D>. <label>"
  5. Recommended Diagnostic Checks
  6. Safety
  7. Source / Evidence              built in Python from what the answer actually used

After generation the LLM text is checked:
  * every [bracketed] source label must name something actually retrieved, else -> [Inference]
  * every "SPN <n>" must be a supplied code or a reference SPN, else the number is removed;
    names of allowed SPNs are rewritten from the database
  * numeric values with units that are not in the retrieved evidence are marked [unverified value]
  * the relationship line must name exactly one class
Each correction is reported in the warnings.
"""
import os
import re
import time
from functools import lru_cache

import bootstrap  # noqa: F401  (loads .env and puts both pipelines on sys.path)
from groq import APIConnectionError, APITimeoutError, Groq, InternalServerError, RateLimitError
from sqlalchemy import text

from db import get_engine

GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
# Tried in order when a model is rate-limited. Each Groq model has its own daily token quota
# (free tier: 200k tokens/day; one diagnosis is ~3-4k tokens), so falling back keeps answers coming.
FALLBACK_MODELS = [m.strip() for m in os.environ.get("GROQ_FALLBACK_MODELS", "qwen/qwen3.8-27b").split(",") if m.strip()]
MAX_RATE_LIMIT_WAIT_S = 30  # a per-minute limit resets quickly; a daily one (minutes/hours) -> next model
PER_MINUTE_DEFAULT_WAIT_S = 12  # when a per-minute 429 carries no retry-after header
MAX_COMPLETION_TOKENS = 2500


class SynthesisUnavailable(RuntimeError):
    """Every model failed; .warnings says why for each one."""

    def __init__(self, warnings: list[str]):
        super().__init__("; ".join(warnings))
        self.warnings = warnings

GENERIC_ONLY = "Generic J1939 decode only — no manufacturer-specific record was found."

RELATIONSHIPS = {
    "A": "DIRECTLY CONSISTENT",
    "B": "POTENTIALLY RELATED",
    "C": "NOT DIRECTLY RELATED",
    "D": "INSUFFICIENT INFORMATION",
}

# SPNs the model may suggest checking, grouped by topic. Names are read from the
# J1939 database at runtime, so the model is never the source of an SPN's meaning.
REFERENCE_SPNS = {
    "accelerator / torque / speed control": [91, 29, 558, 51, 190, 512, 513, 3357, 518, 898, 1254],
    "engine protection / derate": [1107, 1109, 1110, 1111, 971, 1027],
    "lubrication": [100, 98, 175],
    "cooling": [110, 111],
    "fuel / air": [94, 157, 102, 105, 108],
    "electrical": [168],
}

SYSTEM_PROMPT = """You are a J1939 heavy-duty vehicle diagnostic assistant. You analyse BOTH the fault code(s) and
the reported symptom as separate pieces of evidence, then combine them. Neither overrides the other.

You are given: the fault-code facts (already decoded from the J1939 database and shown to the user as
section 1), the user's symptom, a reference list of J1939 SPNs, and service-documentation entries
retrieved by SYMPTOM TEXT SIMILARITY. Those service-doc entries come from a generic automotive dataset:
a match means "this entry describes a similar symptom", NOT "this component is faulty" and NOT "this is
related to the fault code".

Write ONLY sections 2-6, in exactly this format (bold headers, "- " bullets, numbered checks):

**2. Symptom Analysis**
- What the user reports [User report]; which vehicle system(s) could produce it; relevant
  components/systems; whether the retrieved fault-code record documents any relationship with this symptom.

**3. Combined Analysis**
**Relationship:** <exactly ONE of: A. DIRECTLY CONSISTENT | B. POTENTIALLY RELATED | C. NOT DIRECTLY RELATED | D. INSUFFICIENT INFORMATION>
(write only the single chosen letter and label, e.g. "**Relationship:** C. NOT DIRECTLY RELATED")
- Confirmed by the fault code: ...
- Suggested by the symptom: ...
- What may connect the two: ...
- What may be a separate issue: ... (if two problems may be present, say so explicitly)
- Additional fault codes / information to check: ...

**4. Supported/Potential Causes**
- Unranked bullets. Each bullet starts with exactly one evidence type:
  "Retrieved fact:"          ONLY the decoded J1939 facts from section 1 [J1939 DB]
  "Manufacturer record:"     ONLY text from a provided manufacturer record [Manufacturer record]
  "Service-doc similarity:"  a provided service-doc entry lists a similar symptom for component X;
                             state that this is NOT evidence that X is faulty [Service docs: X]
  "Possibility (inference):" your own reasoning [Inference]
  Do NOT rank. Do NOT say "most likely".

**5. Recommended Diagnostic Checks**
1. Safety-critical checks first, then checks for the fault code, then checks for the symptom, then
   additional J1939 parameters / codes that would distinguish between explanations.

**6. Safety**
- One or two bullets. If the fault or symptom could cause engine damage, state it with the exact words
  "engine damage"; if it could make the vehicle unsafe to operate, use the exact words "unsafe operation".

Hard rules:
1. Source labels allowed: [J1939 DB] (ONLY for the decoded facts in section 1 and names in the reference
   SPN list; any conclusion you draw from them is [Inference]), [Manufacturer record] (ONLY if a
   manufacturer record is provided), [Service docs: <exact name from the provided list>] (ONLY names in
   the list), [User report], [Inference]. Never use any other label. Never cite a source not provided.
2. If the fault-code record does not explain the symptom, say so explicitly. Do not force a causal link
   because both were supplied together. Do not claim a component is faulty because its symptoms resemble
   the user's.
3. Engine protection / derate / limp mode / RPM limiting / shutdown: mention a link ONLY as
   manufacturer- and calibration-dependent and NOT established by the generic J1939 record, unless a
   provided manufacturer record states it. Never state it as fact.
4. Never invent part numbers, voltages, pressures, specs, thresholds or procedures that are not provided.
   Do not state "typical" values (e.g. "typically 5 V") - say "per the manufacturer's specification".
5. If the symptom is the same condition the fault code describes, classify A and do NOT bring in
   unrelated components.
6. If no symptom was reported, or no fault code was supplied, classify D and analyse what is available.
7. Do not tell the user to keep driving when the evidence indicates a potentially unsafe condition.
8. Present inferences as possibilities, never as confirmed facts. Plain text only, no tables.
9. SPN numbers: write ONLY the supplied fault codes' SPNs and SPNs from the reference list, always as
   "SPN <n> (<exact name from the list>)". Never write any other SPN number; describe other parameters
   by name only.
10. Mention a service-doc entry only if it genuinely relates to the symptom or code; silently ignore
    unrelated ones (do not list them)."""


# --------------------------------------------------------------------------- reference SPNs

@lru_cache(maxsize=1)
def reference_spn_names() -> dict[int, str]:
    ids = [s for group in REFERENCE_SPNS.values() for s in group]
    with get_engine().connect() as conn:
        rows = conn.execute(text("SELECT spn, spn_name FROM spn_catalog WHERE spn = ANY(:ids)"), {"ids": ids})
        return {spn: name for spn, name in rows}


def _reference_block() -> str:
    names = reference_spn_names()
    return "\n".join(
        f"- {topic}: " + "; ".join(f"SPN {s} ({names[s]})" for s in spns if s in names)
        for topic, spns in REFERENCE_SPNS.items())


# --------------------------------------------------------------------------- deterministic sections

def fault_code_section(sql: dict, obd_codes: list[str]) -> str:
    lines = ["**1. Fault Code Analysis**"]
    if not sql["codes"] and not obd_codes:
        lines.append("- No fault code was supplied.")
    for c in sql["codes"]:
        if not c["found"]:
            lines.append(f"- SPN {c['spn']} FMI {c['fmi']}: not found in the J1939 database — "
                         f"{c['error']['message']}. [J1939 DB]")
            continue
        r = c["sql_result"]
        sae = r["sae_standard"]
        lines += [
            f"- {r['fault_code']} [J1939 DB]",
            f"- SPN {r['spn']}: {sae['spn_name'] or 'not in the SAE SPN catalog (manufacturer-proprietary)'}",
            f"- FMI {r['fmi']}: {sae['fmi_meaning'] or 'non-standard FMI (not defined by SAE)'}",
            f"- Severity (SAE FMI level): {sae['severity'] or 'not assigned by SAE for this FMI'}",
        ]
        rec = r["manufacturer_record"]
        if rec:
            lines.append(f"- Manufacturer-specific record ({rec['manufacturer']} {rec['manufacturer_system']}): "
                         f"{rec['description']} [Manufacturer record]")
        else:
            lines.append(f"- {GENERIC_ONLY}")
            if r["manufacturer_requested"]:
                lines.append(f"- No documented {r['manufacturer_requested']}-specific record exists for this code.")
    for code in obd_codes:
        lines.append(f"- {code}: OBD-II code — not covered by the J1939 database; no retrieved record.")
    return "\n".join(lines)


def source_section(sql: dict, matches: list[dict], cited_docs: list[str] | None = None) -> str:
    """cited_docs: service-doc names the answer actually used (None = no LLM analysis happened)."""
    lines = ["**7. Source / Evidence**"]
    found = [c["sql_result"] for c in sql["codes"] if c["found"]]
    if found:
        urls = sorted({u for r in found for u in r["source_urls"]})
        lines.append("- [J1939 DB] SAE J1939 SPN/FMI reference" + (f" ({', '.join(urls)})" if urls else ""))
    recs = [r["manufacturer_record"] for r in found if r["manufacturer_record"]]
    for rec in recs:
        lines.append(f"- [Manufacturer record] {rec['manufacturer']} {rec['manufacturer_system']} "
                     f"({rec['source_url']})")
    if not recs:
        lines.append("- [Manufacturer record] none retrieved")
    names = list(dict.fromkeys(m["fault_name"] for m in matches))
    if cited_docs is None:
        # No analysis ran, so nothing was judged related - don't present raw matches as evidence.
        lines.append(f"- [Service docs] {len(names)} entr{'y' if len(names) == 1 else 'ies'} retrieved by "
                     "symptom similarity, not analysed (AI analysis unavailable)" if names
                     else "- [Service docs] none retrieved")
        lines.append("- [User report] the symptom as reported")
        return "\n".join(lines)
    used = [n for n in names if n in cited_docs]
    if used:
        lines.append("- [Service docs] matched by symptom-text similarity only (not confirmed causes): "
                     + ", ".join(used))
    else:
        lines.append("- [Service docs] none used" if names else "- [Service docs] none retrieved")
    unused = len(names) - len(used)
    if unused:
        lines.append(f"- {unused} other retrieved service-doc entr{'y was' if unused == 1 else 'ies were'} "
                     "judged unrelated and not used")
    lines.append("- [User report] the symptom as reported; [Inference] = assistant reasoning, not a retrieved fact")
    return "\n".join(lines)


# --------------------------------------------------------------------------- LLM input

def build_prompt(symptoms: str, vehicle: dict, sql: dict, matches: list[dict], obd_codes: list[str]) -> str:
    v = ", ".join(f"{k}: {vehicle[k]}" for k in ("year", "manufacturer", "model", "engine") if vehicle.get(k))
    has_record = any(c["found"] and c["sql_result"]["manufacturer_record"] for c in sql["codes"])
    doc_names = list(dict.fromkeys(m["fault_name"] for m in matches))
    docs = "\n\n".join(
        f"[Service docs: {m['fault_name']}] ({m['system_category']}, {m['section']})\n{m['content']}"
        + ("\nDiagnostic procedure:\n" + "\n".join(
            f"{i}. {s['step']} (possible results: {', '.join(s.get('outcomes') or [])})"
            for i, s in enumerate(m["steps"], 1)) if m.get("steps") and m["section"] != "Diagnostic_Procedures" else "")
        for m in matches) or "(none retrieved)"
    return "\n".join([
        f"Vehicle: {v or 'not specified'}",
        f"Reported symptom: {symptoms or '(no symptom reported)'}",
        "",
        "Section 1 (already shown to the user, facts from the J1939 database):",
        fault_code_section(sql, obd_codes),
        "",
        f"Manufacturer record provided: {'yes' if has_record else 'NO - do not use [Manufacturer record]'}",
        f"Allowed [Service docs: ...] names: {', '.join(doc_names) if doc_names else 'NONE - do not cite service docs'}",
        "",
        "Reference SPNs you may suggest checking (names from the J1939 database):",
        _reference_block(),
        "",
        "Service-doc entries retrieved by symptom similarity:",
        docs,
    ])


# --------------------------------------------------------------------------- output checks

_LABEL = re.compile(r"\[([^\[\]]+)\]")
# Anything that looks like a citation but is not an allowed label, e.g. [Code DB], [OEM manual].
_SOURCE_LIKE = re.compile(r"\b(?:db|database|docs?|documentation|record|knowledge|manual|source|oem|sae)\b")
_SPN_MENTION = re.compile(r"\bSPN\s*(\d{1,6})(\s*\([^)]*\))?")
_VALUE_WITH_UNIT = re.compile(
    r"\b\d+(?:[.,]\d+)?\s?(?:V|volts?|mV|mA|A|psi|kPa|bar|rpm|RPM|°\s?[CF]|ohms?|Ω|Nm|lb-ft|ms|Hz|%)(?!\w)")


def enforce_sources(text_: str, matches: list[dict], has_record: bool) -> tuple[str, list[str]]:
    """Replace any source label that names something not actually retrieved with [Inference]."""
    doc_names = {m["fault_name"].lower() for m in matches}
    problems: list[str] = []

    def check(m: re.Match) -> str:
        label = m.group(1).strip()
        low = label.lower()
        if low in ("j1939 db", "user report", "inference"):
            return m.group(0)
        if low.startswith("manufacturer record"):
            if has_record:
                return m.group(0)
        elif low.startswith("service docs:"):
            if low.split(":", 1)[1].strip() in doc_names:
                return m.group(0)
        elif not _SOURCE_LIKE.search(low):
            return m.group(0)  # not a citation (e.g. "[see step 2]") - leave untouched
        problems.append(f"answer cited a source that was not retrieved ({label!r}); relabelled as [Inference]")
        return "[Inference]"

    return _LABEL.sub(check, text_), problems


def enforce_spns(text_: str, sql: dict) -> tuple[str, list[str]]:
    """Every SPN number must be a supplied code or a reference SPN; names are rewritten from the DB."""
    names = dict(reference_spn_names())
    for c in sql["codes"]:
        if c["found"] and c["sql_result"]["sae_standard"]["spn_name"]:
            names[c["spn"]] = c["sql_result"]["sae_standard"]["spn_name"]
    supplied = {c["spn"] for c in sql["codes"]}
    problems: list[str] = []

    def check(m: re.Match) -> str:
        spn = int(m.group(1))
        if spn in names:
            return f"SPN {spn} ({names[spn]})" if m.group(2) else m.group(0)
        if spn in supplied:
            return m.group(0)
        problems.append(f"answer mentioned unverified SPN {spn}; number removed")
        return "a related parameter" + (m.group(2) or "")

    return _SPN_MENTION.sub(check, text_), problems


def flag_unverified_values(text_: str, evidence: str) -> tuple[str, list[str]]:
    """Mark numeric values with units that do not appear anywhere in the retrieved evidence."""
    normalized_evidence = evidence.replace(" ", "").lower()
    problems: list[str] = []

    def check(m: re.Match) -> str:
        value = m.group(0)
        if value.replace(" ", "").lower() in normalized_evidence:
            return value
        problems.append(f"answer states a value not in the retrieved data ({value!r}); marked [unverified value]")
        return f"{value} [unverified value]"

    return _VALUE_WITH_UNIT.sub(check, text_), problems


_DISMISSIVE = re.compile(r"\b(?:unrelated|not related|irrelevant|not relevant|ignored|ignore[ds]? for relevance)\b",
                         re.IGNORECASE)


def drop_dismissed_docs(text_: str) -> tuple[str, list[str]]:
    """Remove lines that cite a service doc only to call it unrelated (spec: don't list unrelated ones)."""
    kept, problems = [], []
    for line in text_.splitlines():
        if "[Service docs:" in line and _DISMISSIVE.search(line):
            problems.append("removed a line that cited an unrelated service-doc entry")
            continue
        kept.append(line)
    return "\n".join(kept), problems


def parse_relationship(text_: str) -> tuple[dict | None, list[str]]:
    line = next((ln for ln in text_.splitlines() if "Relationship:" in ln), "")
    chosen = [k for k, label in RELATIONSHIPS.items() if label in line.upper()]
    if len(chosen) == 1:
        return {"code": chosen[0], "label": RELATIONSHIPS[chosen[0]]}, []
    if not line:
        return None, ["answer did not state a relationship classification (A-D)"]
    return None, [f"answer's relationship classification is ambiguous: {line.strip()!r}"]


def cited_service_docs(text_: str, matches: list[dict]) -> list[str]:
    cited = {m.group(1).split(":", 1)[1].strip().lower()
             for m in _LABEL.finditer(text_) if m.group(1).lower().startswith("service docs:")}
    return [n for n in dict.fromkeys(m["fault_name"] for m in matches) if n.lower() in cited]


# --------------------------------------------------------------------------- public

def _retry_after(exc: RateLimitError) -> float | None:
    try:
        return float(exc.response.headers.get("retry-after"))
    except (AttributeError, TypeError, ValueError):
        return None


def _complete(prompt: str) -> tuple[str, str, list[str]]:
    """Ask each model in turn; never block for minutes on a daily limit. Returns (text, model, warnings)."""
    client = Groq(api_key=os.environ["GROQ_API_KEY"], timeout=45.0, max_retries=1)
    warnings: list[str] = []
    last_exc: Exception | None = None
    for model in [GROQ_MODEL, *FALLBACK_MODELS]:
        for attempt in (1, 2):
            try:
                completion = client.chat.completions.create(
                    model=model,
                    temperature=0.1,
                    # Answers run ~1.1-1.7k tokens; a cap keeps each call from reserving far more of the
                    # free tier's 8k tokens/minute than it uses.
                    max_completion_tokens=MAX_COMPLETION_TOKENS,
                    messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
                )
                text_ = completion.choices[0].message.content or ""
                # Some reasoning models inline their chain of thought; never show it to the user.
                return re.sub(r"<think>.*?</think>", "", text_, flags=re.DOTALL).strip(), model, warnings
            except RateLimitError as exc:
                last_exc = exc
                wait = _retry_after(exc)
                if wait is None and "per day" not in str(exc):
                    wait = PER_MINUTE_DEFAULT_WAIT_S  # per-minute bucket refills within seconds
                if attempt == 1 and wait is not None and wait <= MAX_RATE_LIMIT_WAIT_S:
                    time.sleep(wait)  # per-minute limit: short wait, same model
                    continue
                kind = "daily" if "per day" in str(exc) else "per-minute"
                when = f", resets in ~{int(wait)}s" if wait else ""
                warnings.append(f"Groq model {model} hit its {kind} token limit{when}")
                break
            except (APIConnectionError, APITimeoutError, InternalServerError) as exc:
                last_exc = exc
                warnings.append(f"Groq model {model} unavailable ({type(exc).__name__})")
                break
    raise SynthesisUnavailable(warnings) from last_exc


def synthesize(symptoms: str, vehicle: dict, sql: dict, matches: list[dict], obd_codes: list[str]) -> dict:
    """Returns {"answer", "relationship": {"code", "label"} | None, "cited_service_docs", "model", "warnings"}."""
    prompt = build_prompt(symptoms, vehicle, sql, matches, obd_codes)
    body, model, model_warnings = _complete(prompt)
    has_record = any(c["found"] and c["sql_result"]["manufacturer_record"] for c in sql["codes"])
    body, dismissed_warnings = drop_dismissed_docs(body)
    body, source_warnings = enforce_sources(body, matches, has_record)
    body, spn_warnings = enforce_spns(body, sql)
    body, value_warnings = flag_unverified_values(body, prompt)
    relationship, rel_warnings = parse_relationship(body)
    cited = cited_service_docs(body, matches)
    answer = "\n\n".join([fault_code_section(sql, obd_codes), body, source_section(sql, matches, cited)])
    return {"answer": answer, "relationship": relationship, "cited_service_docs": cited, "model": model,
            "warnings": model_warnings + dismissed_warnings + source_warnings + spn_warnings + value_warnings
            + rel_warnings}
