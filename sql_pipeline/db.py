"""Shared database engine. DATABASE_URL is read only from .env / the environment."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import Engine, create_engine

PROJECT_ROOT = Path(__file__).resolve().parent
load_dotenv(PROJECT_ROOT / ".env")


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set. Add it to .env (see .env.example).")
    # Neon pooled endpoint: sslmode / channel_binding come from the URL itself.
    # pool_pre_ping handles Neon compute suspending idle connections.
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)
