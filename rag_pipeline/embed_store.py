"""Step 4: Embedding prep + push to a vector database (Chroma, local/persistent).

Groq does not offer an embeddings endpoint (it's chat/completions only), so
embedding uses a local HuggingFace sentence-transformer instead. Swap
EMBEDDING_MODEL / the Chroma call for OpenAI or Pinecone if you'd rather use
a hosted embedding + vector store combo.
"""
from typing import List

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def get_embedder() -> HuggingFaceEmbeddings:
    return HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)


def push_to_chroma(
    chunks: List[Document],
    persist_directory: str = "./chroma_automotive_faults",
    collection_name: str = "automotive_faults",
) -> Chroma:
    embedder = get_embedder()

    # Rebuild the collection from scratch each run. Without this, re-running
    # the pipeline against the same source JSON appends a second copy of
    # every chunk (with possibly-stale metadata, e.g. Severity) on top of the
    # first instead of replacing it.
    existing = Chroma(
        collection_name=collection_name,
        embedding_function=embedder,
        persist_directory=persist_directory,
    )
    existing.delete_collection()

    ids = [chunk.metadata["chunk_id"] for chunk in chunks]
    return Chroma.from_documents(
        documents=chunks,
        embedding=embedder,
        persist_directory=persist_directory,
        collection_name=collection_name,
        ids=ids,
    )
