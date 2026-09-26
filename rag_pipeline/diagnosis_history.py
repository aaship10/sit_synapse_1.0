"""Semantic cache of past diagnoses, stored as its own Chroma collection.

Every /query result (matches + Groq-generated answer) is written here, keyed
by the symptom text's embedding. A new query first searches this collection;
if a past symptom is close enough in meaning, that stored result is returned
directly instead of re-searching the fault knowledge base and re-calling Groq.

This also directly reduces Groq rate-limit pressure: a repeated or
rephrased symptom ("brake pedal is soft" vs "brake pedal feels spongy")
costs zero Groq calls once it's been asked before.
"""
import json
from typing import Any, Dict, List, Optional

from langchain_chroma import Chroma
from langchain_core.documents import Document

from embed_store import get_embedder

HISTORY_COLLECTION_NAME = "diagnosis_history"

# Calibrated against sentence-transformers/all-MiniLM-L6-v2 cosine distance:
# true paraphrases of the same symptom scored 0.12-0.34, unrelated symptoms
# scored 0.79-0.96 (see conversation notes). 0.35 sits in the gap between them.
CACHE_DISTANCE_THRESHOLD = 0.35

_history_store: Optional[Chroma] = None


def get_history_store(persist_directory: str) -> Chroma:
    global _history_store
    if _history_store is None:
        _history_store = Chroma(
            collection_name=HISTORY_COLLECTION_NAME,
            embedding_function=get_embedder(),
            persist_directory=persist_directory,
            # Cosine distance is bounded ([0, 2], ~0 for near-duplicates) and
            # matches how the threshold above was calibrated -- Chroma's other
            # default (raw L2) isn't comparable across embedding magnitudes.
            collection_metadata={"hnsw:space": "cosine"},
        )
    return _history_store


def find_cached_diagnosis(persist_directory: str, query: str) -> Optional[Dict[str, Any]]:
    """Returns the cached {matches, answer} for the closest past symptom, or
    None if nothing in history is close enough in meaning."""
    store = get_history_store(persist_directory)
    results = store.similarity_search_with_score(query, k=1)
    if not results:
        return None

    doc, distance = results[0]
    if distance > CACHE_DISTANCE_THRESHOLD:
        return None

    try:
        return {
            "matches": json.loads(doc.metadata["matches_json"]),
            "answer": doc.metadata.get("answer"),
            "matched_query": doc.page_content,
        }
    except (KeyError, json.JSONDecodeError):
        return None


def store_diagnosis(persist_directory: str, query: str, matches: List[Dict[str, Any]], answer: Optional[str]) -> None:
    """Caches a fresh diagnosis result under the query that produced it."""
    store = get_history_store(persist_directory)
    doc = Document(
        page_content=query,
        metadata={"matches_json": json.dumps(matches), "answer": answer or ""},
    )
    store.add_documents([doc])
