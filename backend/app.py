"""Unified API for the frontend: SQL exact-match + vector RAG + Groq synthesis.

Run from the repo root:
    python backend/app.py            # http://localhost:8008  (Swagger UI at /docs)

Endpoints:
    GET  /health      database + vector store status
    GET  /decode      ?code=SPN 102 FMI 2 -> SAE decode for one code (used by the code chips)
    POST /diagnose    {symptoms, fault_codes, vehicle} -> full hybrid diagnosis (see hybrid.py)
    POST /query       {query} -> symptom-only diagnosis (backwards compatible with rag_pipeline/api.py)
"""
import sys
from contextlib import asynccontextmanager
from typing import List, Optional

import bootstrap  # noqa: F401  (must be first: sys.path, .env, RAG paths)

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text

from db import get_engine
from extractor import extract
from hybrid import OBD_CODE, diagnose, get_vectordb
from query import FaultCodeNotFoundError, InvalidFaultCodeError, fetch_fault_code

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    get_vectordb()  # load (or build once) the Chroma store before serving traffic
    yield


app = FastAPI(
    title="DiagnosticIQ - Hybrid Diagnostic Copilot",
    description="J1939 fault-code database (SQL) + service-doc semantic search (vector DB) + Groq synthesis.",
    version="2.0.0",
    lifespan=lifespan,
)
# Vite dev server runs on another origin (localhost:5173). Local demo: allow all.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Vehicle(BaseModel):
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    engine: Optional[str] = None
    vin: Optional[str] = None


class DiagnoseRequest(BaseModel):
    symptoms: str = Field("", examples=["erratic power and black smoke under load"])
    fault_codes: List[str] = Field(default_factory=list, examples=[["SPN 102 FMI 2"]])
    vehicle: Optional[Vehicle] = None


class QueryRequest(BaseModel):
    query: str = Field(..., examples=["truck loses power on inclines"])


@app.get("/health")
def health() -> dict:
    status = {"status": "ok"}
    try:
        with get_engine().connect() as conn:
            status["fault_entries"] = conn.execute(text("SELECT COUNT(*) FROM fault_entries")).scalar_one()
    except Exception as exc:
        status.update(status="degraded", database_error=type(exc).__name__)
    try:
        status["vector_chunks"] = get_vectordb()._collection.count()
    except Exception as exc:
        status.update(status="degraded", vector_store_error=type(exc).__name__)
    return status


@app.get("/decode")
def decode(code: str = Query(..., examples=["SPN 102 FMI 2"])) -> dict:
    compact = code.strip().replace(" ", "")
    if OBD_CODE.match(compact):
        raise HTTPException(404, detail=f"{compact.upper()} is OBD-II; the database covers J1939 only")
    parsed = extract(code, use_llm_fallback=False).codes
    if len(parsed) != 1:
        raise HTTPException(422, detail=f"Could not parse {code!r} as one J1939 SPN/FMI code")
    spn, fmi = parsed[0]["spn"], parsed[0]["fmi"]
    try:
        r = fetch_fault_code(spn, fmi)
    except (FaultCodeNotFoundError, InvalidFaultCodeError) as exc:
        raise HTTPException(404, detail=str(exc))
    sae = r["sae_standard"]
    return {
        "code": r["fault_code"],
        "standard": "J1939",
        "component": sae["spn_name"] or f"SPN {spn} (manufacturer-proprietary)",
        "description": sae["fmi_meaning"] or f"FMI {fmi} (non-standard)",
        "severity": sae["severity"],
        "manufacturer_specific_data": r["manufacturer_specific_data"],
        "manufacturer_record": r["manufacturer_record"],
    }


@app.post("/diagnose")
def diagnose_endpoint(req: DiagnoseRequest) -> dict:
    if not req.symptoms.strip() and not req.fault_codes:
        raise HTTPException(422, detail="Provide symptoms, fault codes, or both")
    return diagnose(req.symptoms, req.fault_codes, req.vehicle.model_dump() if req.vehicle else None)


@app.post("/query")
def query_endpoint(req: QueryRequest) -> dict:
    if not req.query.strip():
        raise HTTPException(422, detail="query must not be empty")
    return diagnose(symptoms=req.query)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8008)
