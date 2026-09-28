"""Standalone runner for the auth API.

Run:
    python -m auth.main
(from rag_pipeline/, with the venv active)

Then the frontend can call http://localhost:8010/api/auth/...
This app is intentionally separate from api.py (the RAG service) for now so
the two can be developed independently; auth.routes.router is a plain
APIRouter, so it can be folded into api.py's `app` later with a single
`app.include_router(auth_router)` if you'd rather run one process.
"""
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import AUTH_PORT, FRONTEND_ORIGINS
from .routes import router as auth_router

app = FastAPI(title="DiagnosticIQ Auth", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("auth.main:app", host="0.0.0.0", port=AUTH_PORT, reload=True)
