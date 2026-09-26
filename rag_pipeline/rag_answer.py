"""Step 5: Generation -- answer a mechanic's vague symptom query using Groq.

This is the other half of the "dual-database RAG Copilot": retrieve relevant
chunks (optionally hybrid-filtered by System_Category) from the vector store,
then have Groq's LLM turn them into a grounded diagnostic answer.
"""
import os
from typing import List, Optional

from groq import Groq
from langchain_core.documents import Document

from groq_utils import call_with_backoff

ANSWER_PROMPT = """You are an automotive diagnostic copilot helping a service technician.
Use ONLY the retrieved diagnostic context below to answer. If the context is
insufficient, say so explicitly instead of guessing.

Technician query: {query}

Retrieved context:
{context}

Give a concise diagnosis hypothesis, cite the Fault_Name(s) it comes from, and
list the next diagnostic steps in order."""


def _format_context(chunks: List[Document]) -> str:
    parts = []
    for c in chunks:
        meta = c.metadata
        header = f"[{meta.get('Fault_Name')} | {meta.get('System_Category')} | {meta.get('Section')} | Severity: {meta.get('Severity')}]"
        parts.append(f"{header}\n{c.page_content}")
    return "\n\n---\n\n".join(parts)


def generate_diagnostic_answer(
    query: str,
    retrieved_chunks: List[Document],
    model: str = "openai/gpt-oss-120b",
    api_key: Optional[str] = None,
) -> str:
    client = Groq(api_key=api_key or os.environ["GROQ_API_KEY"])
    prompt = ANSWER_PROMPT.format(query=query, context=_format_context(retrieved_chunks))
    completion = call_with_backoff(
        client.chat.completions.create,
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    return completion.choices[0].message.content
