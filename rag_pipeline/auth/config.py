"""Configuration for the auth service, loaded from environment variables.

Reads a `.env` file in the rag_pipeline/ directory (same convention as
api.py). See .env.example for the variables this expects.
"""
import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]  # fail fast if missing/misconfigured

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_DAYS = int(os.environ.get("JWT_EXPIRES_DAYS", "7"))

AUTH_PORT = int(os.environ.get("AUTH_PORT", "8010"))

# Comma-separated list of allowed origins for the frontend dev server(s).
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173").split(",")
    if origin.strip()
]
