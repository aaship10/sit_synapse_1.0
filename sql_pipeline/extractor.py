"""Query router / entity extractor for raw technician input.

    extract(raw_text, use_llm_fallback=True) -> Extraction

1. Fault codes  - deterministic regex (no LLM). Supported formats, case-insensitive
                  and whitespace-tolerant:
                    "SPN 102 FMI 2", "SPN: 102 / FMI: 2", "spn102fmi2",
                    "SPN 102, FMI 2", "SPN-102 FMI-2", "102-2", "SPN 102-2"
2. Vehicle      - keyword tables first (manufacturer / model / engine / year).
                  Only if the keyword pass finds *nothing* is the Groq LLM asked,
                  and every value it returns must be locatable in the input text
                  (exact or fuzzy) or it is discarded - the LLM cannot invent a truck.
3. Symptom text - input with code and vehicle mentions (and filler like "throwing")
                  stripped out, ready for the vector-DB branch.
"""
from __future__ import annotations

import difflib
import json
import os
import re
from dataclasses import dataclass, field

from db import PROJECT_ROOT  # noqa: F401  (importing db loads .env)

# llama-3.3-70b-versatile is no longer served by Groq for this account; gpt-oss-120b is.
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
MAX_SPN = 524_287

# --------------------------------------------------------------------------- codes

_LABELED_CODE = re.compile(
    r"\bspn\s*[:#=\-]?\s*(\d{1,6})\s*[,/;|\-]?\s*(?:and\s+)?fmi\s*[:#=\-]?\s*(\d{1,3})\b",
    re.IGNORECASE,
)
# "102-2" or "SPN 102-2". No spaces around the dash, to avoid ranges like "1500 - 20 psi".
_DASH_CODE = re.compile(
    r"(?<![\w./:\-])(?:spn\s*[:#]?\s*)?(\d{1,6})-(\d{1,2})(?![\w./:\-])",
    re.IGNORECASE,
)
_SPN_ONLY = re.compile(r"\bspn\s*[:#=\-]?\s*(\d{1,6})\b(?!\s*[,/;|\-]?\s*fmi)", re.IGNORECASE)


def _looks_like_year_range(spn: int, fmi_text: str) -> bool:
    # "2018-19" is a model-year range, not SPN 2018 FMI 19.
    return 1980 <= spn <= 2049 and len(fmi_text) == 2


# --------------------------------------------------------------------------- vehicle tables

MANUFACTURERS: dict[str, str] = {
    "freightliner": "Freightliner", "kenworth": "Kenworth", "peterbilt": "Peterbilt",
    "pete": "Peterbilt", "volvo": "Volvo", "mack": "Mack", "international": "International",
    "navistar": "International", "western star": "Western Star", "sitrak": "SITRAK",
    "sinotruk": "SITRAK", "sino truk": "SITRAK", "howo": "Sinotruk HOWO", "isuzu": "Isuzu",
    "hino": "Hino", "ford": "Ford", "chevrolet": "Chevrolet", "chevy": "Chevrolet",
    "gmc": "GMC", "scania": "Scania", "daf": "DAF", "iveco": "Iveco",
    "mercedes-benz": "Mercedes-Benz", "mercedes": "Mercedes-Benz", "tata": "Tata",
    "ashok leyland": "Ashok Leyland", "eicher": "Eicher", "bharatbenz": "BharatBenz",
    "autocar": "Autocar", "sterling": "Sterling",
}
# Case-sensitive: these collide with ordinary English words when lower-cased.
MANUFACTURERS_CASE_SENSITIVE = {"MAN": "MAN"}

# model -> (canonical model, manufacturer)
MODELS: dict[str, tuple[str, str]] = {
    "cascadia": ("Cascadia", "Freightliner"), "columbia": ("Columbia", "Freightliner"),
    "coronado": ("Coronado", "Freightliner"), "century class": ("Century Class", "Freightliner"),
    "m2 106": ("M2 106", "Freightliner"), "m2 112": ("M2 112", "Freightliner"),
    "m2": ("M2", "Freightliner"), "114sd": ("114SD", "Freightliner"), "122sd": ("122SD", "Freightliner"),
    "t680": ("T680", "Kenworth"), "t880": ("T880", "Kenworth"), "w900": ("W900", "Kenworth"),
    "w990": ("W990", "Kenworth"), "t800": ("T800", "Kenworth"), "t370": ("T370", "Kenworth"),
    "vnl": ("VNL", "Volvo"), "vnr": ("VNR", "Volvo"), "vhd": ("VHD", "Volvo"), "vah": ("VAH", "Volvo"),
    "anthem": ("Anthem", "Mack"), "granite": ("Granite", "Mack"), "pinnacle": ("Pinnacle", "Mack"),
    "lonestar": ("LoneStar", "International"), "prostar": ("ProStar", "International"),
    "5700xe": ("5700XE", "Western Star"), "49x": ("49X", "Western Star"), "57x": ("57X", "Western Star"),
    "c7h": ("C7H", "SITRAK"), "c9h": ("C9H", "SITRAK"), "g7s": ("G7S", "SITRAK"),
    "g7": ("G7", "SITRAK"), "t7h": ("T7H", "SITRAK"),
}
MODELS_CASE_SENSITIVE: dict[str, tuple[str, str]] = {
    "LT": ("LT", "International"), "HX": ("HX", "International"), "HV": ("HV", "International"),
}
# Numeric Peterbilt / Western Star models only count right after the brand name.
_NUMERIC_MODEL = re.compile(r"\b(peterbilt|pete|western star)\s+(\d{3,4})\b", re.IGNORECASE)

# engine -> (canonical engine, engine manufacturer)
ENGINES: dict[str, tuple[str, str]] = {
    "dd13": ("DD13", "Detroit"), "dd15": ("DD15", "Detroit"), "dd16": ("DD16", "Detroit"),
    "dd8": ("DD8", "Detroit"), "dd5": ("DD5", "Detroit"), "series 60": ("Series 60", "Detroit"),
    "isx15": ("ISX15", "Cummins"), "isx12": ("ISX12", "Cummins"), "isx": ("ISX", "Cummins"),
    "x15": ("X15", "Cummins"), "x12": ("X12", "Cummins"), "isb6.7": ("ISB6.7", "Cummins"),
    "isb": ("ISB", "Cummins"), "isl9": ("ISL9", "Cummins"), "isl": ("ISL", "Cummins"),
    "l9": ("L9", "Cummins"), "b6.7": ("B6.7", "Cummins"), "ism": ("ISM", "Cummins"),
    "n14": ("N14", "Cummins"),
    "mx-13": ("MX-13", "PACCAR"), "mx13": ("MX-13", "PACCAR"), "mx-11": ("MX-11", "PACCAR"),
    "mx11": ("MX-11", "PACCAR"),
    "d11": ("D11", "Volvo"), "d13": ("D13", "Volvo"), "d16": ("D16", "Volvo"),
    "mp7": ("MP7", "Mack"), "mp8": ("MP8", "Mack"), "mp10": ("MP10", "Mack"),
    "a26": ("A26", "International"), "n13": ("N13", "International"),
    "maxxforce 13": ("MaxxForce 13", "International"), "maxxforce": ("MaxxForce", "International"),
    "c15": ("C15", "Caterpillar"), "c13": ("C13", "Caterpillar"), "3406": ("3406", "Caterpillar"),
    "mc11": ("MC11", "Sinotruk"), "mc13": ("MC13", "Sinotruk"),
}
ENGINE_MAKERS: dict[str, str] = {
    "detroit diesel": "Detroit", "detroit": "Detroit", "cummins": "Cummins",
    "paccar": "PACCAR", "caterpillar": "Caterpillar", "cat": "Caterpillar",
}

_YEAR = re.compile(r"\b(?:(?:model\s+year|my)\s*)?((?:19[89]|20[0-4])\d)\b", re.IGNORECASE)


def _keyword_regex(keys, flags=re.IGNORECASE) -> re.Pattern:
    alternation = "|".join(re.escape(k) for k in sorted(keys, key=len, reverse=True))
    return re.compile(rf"(?<![\w\-])({alternation})(?![\w\-]|\.\d)", flags)


_MFR_RE = _keyword_regex(MANUFACTURERS)
_MFR_CS_RE = _keyword_regex(MANUFACTURERS_CASE_SENSITIVE, 0)
_MODEL_RE = _keyword_regex(MODELS)
_MODEL_CS_RE = _keyword_regex(MODELS_CASE_SENSITIVE, 0)
_ENGINE_RE = _keyword_regex(ENGINES)
_ENGINE_MAKER_RE = _keyword_regex(ENGINE_MAKERS)

# --------------------------------------------------------------------------- result type


@dataclass
class Extraction:
    codes: list[dict] = field(default_factory=list)          # [{"spn", "fmi", "raw"}]
    spn_only_mentions: list[int] = field(default_factory=list)  # "SPN 3251" with no FMI
    vehicle: dict = field(default_factory=lambda: {
        "manufacturer": None, "model": None, "engine": None,
        "engine_manufacturer": None, "year": None,
    })
    symptom_text: str = ""
    vehicle_extraction_method: str = "none"                 # none | keyword | llm
    notes: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------- helpers

_CODE_MARK, _VEH_MARK = "\x00", "\x01"


def _overlaps(span, taken) -> bool:
    return any(span[0] < e and s < span[1] for s, e in taken)


def _extract_codes(text: str, result: Extraction) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    found: list[tuple[int, int, int, str]] = []  # (pos, spn, fmi, raw)
    for pattern in (_LABELED_CODE, _DASH_CODE):
        for m in pattern.finditer(text):
            if _overlaps(m.span(), spans):
                continue
            spn, fmi = int(m.group(1)), int(m.group(2))
            if pattern is _DASH_CODE and _looks_like_year_range(spn, m.group(2)):
                continue
            if spn > MAX_SPN or (pattern is _DASH_CODE and fmi > 31):
                continue
            spans.append(m.span())
            found.append((m.start(), spn, fmi, m.group(0)))

    seen = set()
    for _, spn, fmi, raw in sorted(found):
        if (spn, fmi) not in seen:
            seen.add((spn, fmi))
            result.codes.append({"spn": spn, "fmi": fmi, "raw": raw.strip()})

    for m in _SPN_ONLY.finditer(text):
        if not _overlaps(m.span(), spans):
            spans.append(m.span())
            result.spn_only_mentions.append(int(m.group(1)))
    return spans


def _extract_vehicle_keywords(text: str, taken: list[tuple[int, int]], result: Extraction) -> list:
    spans: list[tuple[int, int]] = []
    v = result.vehicle

    def first(regexes_and_tables):
        for regex, table in regexes_and_tables:
            for m in regex.finditer(text):
                if not _overlaps(m.span(), taken + spans):
                    key = m.group(1) if table is MANUFACTURERS_CASE_SENSITIVE or table is MODELS_CASE_SENSITIVE \
                        else m.group(1).lower()
                    return m, table[key]
        return None, None

    m = _NUMERIC_MODEL.search(text)
    if m and not _overlaps(m.span(), taken):
        v["manufacturer"] = MANUFACTURERS[m.group(1).lower()]
        v["model"] = m.group(2)
        spans.append(m.span())

    if v["model"] is None:
        m, value = first([(_MODEL_RE, MODELS), (_MODEL_CS_RE, MODELS_CASE_SENSITIVE)])
        if m:
            v["model"], implied_mfr = value
            v["manufacturer"] = v["manufacturer"] or implied_mfr
            spans.append(m.span())

    m, value = first([(_MFR_RE, MANUFACTURERS), (_MFR_CS_RE, MANUFACTURERS_CASE_SENSITIVE)])
    if m:
        v["manufacturer"] = value  # an explicit brand beats a model-implied one
        spans.append(m.span())

    m, value = first([(_ENGINE_RE, ENGINES)])
    if m:
        v["engine"], v["engine_manufacturer"] = value
        spans.append(m.span())
    m, value = first([(_ENGINE_MAKER_RE, ENGINE_MAKERS)])
    if m:
        v["engine_manufacturer"] = v["engine_manufacturer"] or value
        spans.append(m.span())

    # A year only counts when it is attached to the vehicle ("2018 Freightliner",
    # "MY2018"), so "idles at 2000 rpm" is not read as a model year.
    vehicle_starts = {s for s, _ in spans}
    for ym in _YEAR.finditer(text):
        if _overlaps(ym.span(), taken + spans):
            continue
        rest = text[ym.end():]
        gap = len(rest) - len(rest.lstrip())
        explicit = ym.group(0).lower().startswith(("model", "my"))
        if explicit or ym.end() + gap in vehicle_starts:
            v["year"] = int(ym.group(1))
            spans.append(ym.span())
            break

    if any(v[k] for k in ("manufacturer", "model", "engine", "engine_manufacturer")):
        result.vehicle_extraction_method = "keyword"
    return spans


def _locate(value: str, text: str) -> tuple[int, int] | None:
    """Find value in text exactly or fuzzily (for typos like 'frieghtliner')."""
    idx = text.lower().find(value.lower())
    if idx >= 0:
        return idx, idx + len(value)
    n = len(value.split())
    words = [(m.start(), m.end()) for m in re.finditer(r"[\w\-.]+", text)]
    grams = {}
    for i in range(len(words) - n + 1):
        s, e = words[i][0], words[i + n - 1][1]
        grams[text[s:e].lower()] = (s, e)
    match = difflib.get_close_matches(value.lower(), list(grams), n=1, cutoff=0.8)
    return grams[match[0]] if match else None


def _canonical(value: str, table: dict):
    """Map an LLM-returned name (possibly misspelt, e.g. 'frieghtliner') to our canonical entry."""
    match = difflib.get_close_matches(value.lower(), list(table), n=1, cutoff=0.8)
    return table[match[0]] if match else None


def _llm_vehicle(text: str, taken: list[tuple[int, int]], result: Extraction) -> list:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        result.notes.append("LLM vehicle fallback skipped: GROQ_API_KEY not set.")
        return []
    try:
        from groq import Groq

        client = Groq(api_key=api_key, timeout=15.0)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": (
                    "Extract the vehicle mentioned in a heavy-duty truck technician's note. "
                    "Return JSON with keys manufacturer, model, engine, year. Use null for anything "
                    "not explicitly mentioned. Never guess or infer values that are not in the text.")},
                {"role": "user", "content": text},
            ],
        )
        data = json.loads(response.choices[0].message.content or "{}")
    except Exception as exc:  # network, auth, bad JSON: degrade to keyword result
        result.notes.append(f"LLM vehicle fallback failed ({type(exc).__name__}); using keyword result.")
        return []

    spans = []
    v = result.vehicle
    for key in ("manufacturer", "model", "engine", "year"):
        value = data.get(key)
        if value in (None, "", "null"):
            continue
        span = _locate(str(value), text)
        if span is None or _overlaps(span, taken + spans):
            result.notes.append(f"LLM proposed {key}={value!r} but it is not in the input; discarded.")
            continue
        value = str(value).strip()
        if key == "year":
            try:
                v["year"] = int(value)
            except ValueError:
                continue
        elif key == "manufacturer":
            v["manufacturer"] = _canonical(value, MANUFACTURERS) or value
        elif key == "engine":
            v["engine"], v["engine_manufacturer"] = _canonical(value, ENGINES) or (value, None)
        else:
            model = _canonical(value, MODELS)
            v["model"] = model[0] if model else value
            if model and not v["manufacturer"]:
                v["manufacturer"] = model[1]
        spans.append(span)
    if spans:
        result.vehicle_extraction_method = "llm"
    return spans


_CODE_FILLER_BEFORE = re.compile(
    r"(?:\b(?:is|it's|keeps?|also|and)\s+)?"
    r"(?:\b(?:throwing|throws|threw|thrown|showing|shows|setting|sets|set|logged|logging|"
    r"getting|reading|reads|popping|popped|flagging|flashing|having|has|with)\s+)?"
    r"(?:\b(?:an?|the)\s+)?(?:\b(?:active|inactive|fault|trouble|diagnostic|error)\s+)*"
    r"(?:\b(?:codes?|dtcs?)\s*[:\-]?\s*)?" + _CODE_MARK,
    re.IGNORECASE,
)
_CODE_FILLER_AFTER = re.compile(_CODE_MARK + r"\s*(?:(?:fault|trouble)\s+)?\b(?:codes?|dtcs?)\b", re.IGNORECASE)
_VEH_FILLER_BEFORE = re.compile(
    r"\b(?:on|in|for|with|from|of|my|our|a|an|the)\s+(?=" + _VEH_MARK + ")", re.IGNORECASE)
_VEH_FILLER_AFTER = re.compile(_VEH_MARK + r"\s+(?:engine|motor)\b", re.IGNORECASE)
_EDGE_WORDS = re.compile(r"^(?:\s|[,;:.\-/]|\b(?:and|with|but|also|plus|then)\b)+|"
                         r"(?:\s|[,;:\-/]|\b(?:and|with|but|also|plus|then)\b)+$", re.IGNORECASE)


def _symptom_text(text: str, code_spans, vehicle_spans) -> str:
    chars = list(text)
    for spans, mark in ((code_spans, _CODE_MARK), (vehicle_spans, _VEH_MARK)):
        for s, e in spans:
            chars[s] = mark
            for i in range(s + 1, e):
                chars[i] = ""
    out = "".join(chars)
    out = _CODE_FILLER_AFTER.sub(_CODE_MARK, out)
    out = _VEH_FILLER_AFTER.sub(_VEH_MARK, out)
    for _ in range(3):  # "with a 2018 Freightliner" -> strip nested filler
        out = _CODE_FILLER_BEFORE.sub(_CODE_MARK, out)
        out = _VEH_FILLER_BEFORE.sub("", out)
    out = re.sub(f"[{_CODE_MARK}{_VEH_MARK}]", " ", out)
    out = re.sub(r"\s*([,;])\s*(?:[,;]\s*)*", r"\1 ", out)   # collapse separators
    out = re.sub(r"\s{2,}", " ", out)
    out = _EDGE_WORDS.sub("", out).strip()
    return out


# --------------------------------------------------------------------------- public API

def extract(raw_text: str, use_llm_fallback: bool = True) -> Extraction:
    result = Extraction()
    text = raw_text or ""
    code_spans = _extract_codes(text, result)
    vehicle_spans = _extract_vehicle_keywords(text, code_spans, result)
    if not vehicle_spans and use_llm_fallback and text.strip():
        vehicle_spans = _llm_vehicle(text, code_spans, result)
    for spn in result.spn_only_mentions:
        result.notes.append(f"SPN {spn} mentioned without an FMI; cannot do an exact code lookup.")
    result.symptom_text = _symptom_text(text, code_spans, vehicle_spans)
    return result
