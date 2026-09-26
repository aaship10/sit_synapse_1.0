"""Wire the two pipelines together without modifying how they import things.

sql_pipeline/ and rag_pipeline/ both use flat imports (``from db import ...``,
``from build_store import ...``) and the RAG code resolves its data paths
relative to the working directory. Importing this module first:
  * loads .env (repo root first, then each pipeline's own .env; never overrides),
  * pins the RAG data/store paths to absolute paths so the server works from any cwd,
  * puts both pipeline folders on sys.path.
Module names in the two folders do not collide, so both can live on sys.path.
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
SQL_DIR = ROOT / "sql_pipeline"
RAG_DIR = ROOT / "rag_pipeline"

for env_file in (ROOT / ".env", SQL_DIR / ".env", RAG_DIR / ".env"):
    load_dotenv(env_file)

os.environ.setdefault(
    "FAULTS_JSON_PATH", str(RAG_DIR / "vector_database_extracted" / "automotive_faults_aktc_obike_et_al.json"))
os.environ.setdefault("CHROMA_PERSIST_DIR", str(RAG_DIR / "chroma_automotive_faults"))
os.environ.setdefault("GROQ_TAG_CACHE_PATH", str(RAG_DIR / "groq_tag_cache.json"))

for folder in (SQL_DIR, RAG_DIR):
    if str(folder) not in sys.path:
        sys.path.insert(0, str(folder))
