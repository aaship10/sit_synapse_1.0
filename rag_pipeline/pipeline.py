"""Build (or rebuild) the automotive-faults vector store.

Run with no arguments -- input now comes from the frontend via api.py, not
the terminal, so this script's only job is the offline build step (ingest ->
Groq severity tagging -> chunk -> embed -> persist to Chroma). Run this once
(or whenever the source dataset changes), then start api.py to serve queries.

Usage:
    python pipeline.py
    python pipeline.py --no-groq-tagging
    python pipeline.py --json-path other_dataset.json --persist-dir ./other_store
"""
import argparse
import sys

from dotenv import load_dotenv

from build_store import DEFAULT_DATASET_PATH, DEFAULT_PERSIST_DIR, build_vector_store

load_dotenv()

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json-path", default=DEFAULT_DATASET_PATH)
    parser.add_argument("--persist-dir", default=DEFAULT_PERSIST_DIR)
    parser.add_argument("--no-groq-tagging", action="store_true", help="Skip Groq severity backfill")
    args = parser.parse_args()

    build_vector_store(
        json_path=args.json_path,
        persist_directory=args.persist_dir,
        use_groq_tagging=not args.no_groq_tagging,
    )
    print("\nStart the API with: python api.py   (then open http://localhost:8008/docs)")


if __name__ == "__main__":
    main()
