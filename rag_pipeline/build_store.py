"""Shared build routine: source JSON -> tagged, chunked, embedded Chroma store.

Used by both pipeline.py (one-off/CLI build) and api.py (build-on-startup for
the frontend to query). Keeping it in one place means the two never drift.
"""
import os

from langchain_chroma import Chroma

from chunking import chunk_documents
from embed_store import push_to_chroma
from ingest import faults_to_documents, load_faults
from metadata_tagger import backfill_metadata

DEFAULT_DATASET_PATH = os.environ.get(
    "FAULTS_JSON_PATH",
    "vector_database_extracted/automotive_faults_aktc_obike_et_al.json",
)
DEFAULT_PERSIST_DIR = os.environ.get("CHROMA_PERSIST_DIR", "./chroma_automotive_faults")
COLLECTION_NAME = "automotive_faults"


def build_vector_store(
    json_path: str = DEFAULT_DATASET_PATH,
    persist_directory: str = DEFAULT_PERSIST_DIR,
    use_groq_tagging: bool = True,
) -> Chroma:
    records = load_faults(json_path)
    print(f"Loaded {len(records)} fault records from {json_path}")

    docs = faults_to_documents(records)
    print(f"Built {len(docs)} field-level documents (pre-chunk)")

    if use_groq_tagging:
        docs = backfill_metadata(docs)
        print("Backfilled missing System_Category/Severity via Groq")

    chunks = chunk_documents(docs)
    print(f"Produced {len(chunks)} chunks ready for embedding")

    vectordb = push_to_chroma(chunks, persist_directory, COLLECTION_NAME)
    print(f"Vector store persisted at {persist_directory}")
    return vectordb
