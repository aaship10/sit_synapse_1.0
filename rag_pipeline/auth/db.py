"""Postgres (Neon) connection pool and small query helpers."""
from contextlib import contextmanager

from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor

from .config import DATABASE_URL

_pool = pg_pool.SimpleConnectionPool(1, 10, dsn=DATABASE_URL)


@contextmanager
def get_cursor(commit: bool = False):
    """Yields a RealDictCursor from the pool; commits and returns the
    connection to the pool afterwards (or rolls back on error)."""
    conn = _pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            yield cur
        if commit:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)
