# Auth service

FastAPI + Neon Postgres auth for DiagnosticIQ: signup, login, JWT-based
sessions. Runs standalone on its own port so it doesn't collide with the RAG
API (`api.py`, port 8008) while both are being developed.

## Setup

```bash
cd rag_pipeline
python -m venv venv
./venv/Scripts/pip install -r requirements.txt   # (venv/bin/pip on macOS/Linux)
cp .env.example .env                             # then fill in DATABASE_URL + JWT_SECRET
./venv/Scripts/python -m auth.migrate            # creates the users table, seeds a demo account
./venv/Scripts/python -m auth.main               # serves http://localhost:8010
```

Generate a `JWT_SECRET` with:
```bash
python -c "import secrets; print(secrets.token_hex(48))"
```

## Endpoints

| Method | Path              | Body                                    | Notes                          |
|--------|-------------------|------------------------------------------|---------------------------------|
| POST   | `/api/auth/signup`| `{name, email, shop, password}`          | 409 if email taken             |
| POST   | `/api/auth/login` | `{email, password}`                      | 401 on bad credentials          |
| GET    | `/api/auth/me`    | —  (`Authorization: Bearer <token>`)     | 401 if missing/expired token    |

`signup`/`login` both return `{ token, user: { name, email, shop } }`.

## Merging into the RAG API later

`auth.routes.router` is a plain `APIRouter`. To run everything as one process,
add to `api.py`:
```python
from auth.routes import router as auth_router
app.include_router(auth_router)
```
and drop `auth/main.py`'s standalone app.

## Notes

- Passwords are hashed with bcrypt; never stored in plaintext.
- `users` table: `id (uuid pk), name, email (unique), shop, password_hash, created_at`.
- CORS is locked to `FRONTEND_ORIGIN` in `.env` (comma-separate for multiple origins).
