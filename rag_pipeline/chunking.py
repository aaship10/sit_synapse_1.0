"""Step 2: Semantic chunking that never splits a diagnostic step mid-thought."""
from typing import List

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Separator priority, most-structural first. The splitter only falls back to a
# lower-priority separator (eventually raw characters) if a chunk still won't
# fit -- so a well-formed record almost always breaks on "\n\n" or "\nStep ".
SEPARATORS = [
    "\n\n",     # paragraph / section boundary
    "\nStep ",  # numbered diagnostic step boundary
    "\n",       # single line break (bullets, sub-steps)
    ". ",       # sentence boundary
    " ",
    "",
]

CHUNK_SIZE = 900
CHUNK_OVERLAP = 180  # ~20%: enough to carry a prior step's measured value/result forward


def build_splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=SEPARATORS,
        keep_separator=True,
    )


def chunk_documents(docs: List[Document]) -> List[Document]:
    splitter = build_splitter()
    chunks = splitter.split_documents(docs)
    for i, chunk in enumerate(chunks):
        fault = chunk.metadata.get("Fault_Name", "unknown").replace(" ", "_")
        section = chunk.metadata.get("Section", "na")
        chunk.metadata["chunk_id"] = f"{fault}-{section}-{i}"
    return chunks
