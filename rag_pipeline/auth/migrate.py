"""Creates the users table if it doesn't exist, and seeds one demo account
matching the frontend's login hint (safe to re-run).

Run:
    python -m auth.migrate
(from rag_pipeline/, with the venv active)
"""
from .db import get_cursor
from .security import hash_password

DEMO_USER = {
    "name": "J. Morales",
    "email": "j.morales@fleetworks.com",
    "shop": "Fleetworks Diesel & Repair",
    "password": "trucking123",
}


def run():
    with get_cursor(commit=True) as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                shop TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        print("users table ready.")

        cur.execute("SELECT 1 FROM users WHERE email = %s", (DEMO_USER["email"],))
        if cur.fetchone():
            print(f"Demo user {DEMO_USER['email']} already exists — skipping seed.")
            return

        cur.execute(
            """
            INSERT INTO users (name, email, shop, password_hash)
            VALUES (%s, %s, %s, %s)
            """,
            (
                DEMO_USER["name"],
                DEMO_USER["email"],
                DEMO_USER["shop"],
                hash_password(DEMO_USER["password"]),
            ),
        )
        print(f"Seeded demo user {DEMO_USER['email']} / {DEMO_USER['password']}")


if __name__ == "__main__":
    run()
