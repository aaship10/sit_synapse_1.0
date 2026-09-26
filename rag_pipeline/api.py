"""FastAPI front-end for the automotive diagnostic RAG copilot.

Run:
    python api.py

Then open http://localhost:8008/docs for interactive Swagger UI -- that's
where you type in the query/filter instead of passing them as CLI args.

On startup, this loads the persisted Chroma vector store at
CHROMA_PERSIST_DIR if it already exists (built previously by pipeline.py or
a prior run of this API), otherwise it builds it once from the source JSON.
"""
import os
import sys
from pathlib import Path
from typing import List, Optional

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from langchain_chroma import Chroma
from pydantic import BaseModel, Field

from build_store import COLLECTION_NAME, DEFAULT_DATASET_PATH, DEFAULT_PERSIST_DIR, build_vector_store
from embed_store import get_embedder
from rag_answer import generate_diagnostic_answer

load_dotenv()

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PERSIST_DIR = DEFAULT_PERSIST_DIR

VALID_CATEGORIES = [
    "ABS System",
    "Air Conditioning System",
    "Cooling System",
    "Drivetrain",
    "Electrical System",
    "Emissions System",
    "Engine Compartment",
    "Engine Components",
    "Fuel System",
    "Liquid Systems",
    "Steering",
    "Transmission",
    "Wheels & Tires",
]

app = FastAPI(
    title="Automotive Diagnostic RAG Copilot",
    description="Semantic search + Groq-generated diagnosis over the Automotive Faults Dataset.",
    version="1.0.0",
)

_vectordb: Optional[Chroma] = None


@app.on_event("startup")
def startup() -> None:
    global _vectordb
    if Path(PERSIST_DIR).exists():
        _vectordb = Chroma(
            collection_name=COLLECTION_NAME,
            embedding_function=get_embedder(),
            persist_directory=PERSIST_DIR,
        )
    else:
        _vectordb = build_vector_store(json_path=DEFAULT_DATASET_PATH, persist_directory=PERSIST_DIR)


class QueryRequest(BaseModel):
    query: str = Field(..., examples=["truck loses power on inclines"])
    filter_category: Optional[str] = Field(
        None,
        description=f"Restrict the search to one System_Category. One of: {', '.join(VALID_CATEGORIES)}",
        examples=["Fuel System"],
    )
    top_k: int = Field(4, ge=1, le=20)
    generate_answer: bool = Field(
        True, description="Also ask Groq to synthesize a diagnosis from the retrieved matches"
    )


class RetrievedChunk(BaseModel):
    fault_name: str
    system_category: str
    severity: str
    section: str
    content: str


class QueryResponse(BaseModel):
    query: str
    filter_category: Optional[str]
    matches: List[RetrievedChunk]
    answer: Optional[str] = None


@app.post("/query", response_model=QueryResponse)
def query(req: QueryRequest) -> QueryResponse:
    if _vectordb is None:
        raise HTTPException(status_code=503, detail="Vector store not initialized yet")

    if req.filter_category and req.filter_category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=422,
            detail=f"filter_category must be one of {VALID_CATEGORIES}",
        )

    search_filter = {"System_Category": req.filter_category} if req.filter_category else None
    results = _vectordb.similarity_search(req.query, k=req.top_k, filter=search_filter)

    matches = [
        RetrievedChunk(
            fault_name=r.metadata.get("Fault_Name", ""),
            system_category=r.metadata.get("System_Category", ""),
            severity=r.metadata.get("Severity", ""),
            section=r.metadata.get("Section", ""),
            content=r.page_content,
        )
        for r in results
    ]

    answer = None
    if req.generate_answer and results:
        if not os.environ.get("GROQ_API_KEY"):
            raise HTTPException(status_code=400, detail="GROQ_API_KEY not set; cannot generate answer")
        answer = generate_diagnostic_answer(req.query, results)

    return QueryResponse(query=req.query, filter_category=req.filter_category, matches=matches, answer=answer)


@app.get("/categories", response_model=List[str])
def categories() -> List[str]:
    return VALID_CATEGORIES


@app.post("/rebuild", status_code=202)
def rebuild() -> dict:
    """Force a full rebuild of the vector store from the source JSON."""
    global _vectordb
    _vectordb = build_vector_store(json_path=DEFAULT_DATASET_PATH, persist_directory=PERSIST_DIR)
    return {"status": "rebuilt", "persist_dir": PERSIST_DIR}


if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8008, reload=False)
