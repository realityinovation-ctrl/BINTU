"""Long-term memory backends: local JSON store + optional Mem0."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

from bintu.assistant.config import mem0_enabled, memory_data_dir


@dataclass(frozen=True)
class MemoryHit:
    text: str
    score: float = 1.0


class MemoryBackend(Protocol):
    name: str

    def add(self, text: str, *, user_id: str, metadata: dict[str, str] | None = None) -> None:
        ...

    def search(self, query: str, *, user_id: str, limit: int = 5) -> list[MemoryHit]:
        ...


class LocalJsonMemory:
    """File-backed memory with simple token overlap retrieval (no external API)."""

    name = "local"

    def __init__(self, root: Path | None = None) -> None:
        self._root = root or memory_data_dir()
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, user_id: str) -> Path:
        safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", user_id)[:120] or "anonymous"
        return self._root / f"{safe}.jsonl"

    def add(self, text: str, *, user_id: str, metadata: dict[str, str] | None = None) -> None:
        cleaned = " ".join(text.split())
        if not cleaned:
            return
        record = {
            "text": cleaned,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        path = self._path(user_id)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    def search(self, query: str, *, user_id: str, limit: int = 5) -> list[MemoryHit]:
        path = self._path(user_id)
        if not path.exists():
            return []
        tokens = _tokens(query)
        scored: list[MemoryHit] = []
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                text = str(payload.get("text") or "").strip()
                if not text:
                    continue
                score = _overlap(tokens, _tokens(text))
                if score <= 0 and tokens:
                    continue
                scored.append(MemoryHit(text=text, score=score if tokens else 1.0))
        scored.sort(key=lambda item: item.score, reverse=True)
        return scored[: max(1, limit)]


class Mem0Memory:
    """Optional Mem0 engine when BINTU_MEM0=1 and mem0ai is installed."""

    name = "mem0"

    def __init__(self) -> None:
        from mem0 import Memory

        config = _mem0_config()
        self._memory = Memory.from_config(config) if config else Memory()

    def add(self, text: str, *, user_id: str, metadata: dict[str, str] | None = None) -> None:
        cleaned = " ".join(text.split())
        if not cleaned:
            return
        kwargs: dict[str, object] = {"user_id": user_id}
        if metadata:
            kwargs["metadata"] = metadata
        self._memory.add(cleaned, **kwargs)

    def search(self, query: str, *, user_id: str, limit: int = 5) -> list[MemoryHit]:
        raw = self._memory.search(query, user_id=user_id, limit=limit)
        results = raw.get("results", raw) if isinstance(raw, dict) else raw
        hits: list[MemoryHit] = []
        if not isinstance(results, list):
            return hits
        for item in results:
            if isinstance(item, dict):
                text = str(item.get("memory") or item.get("text") or "").strip()
                score = float(item.get("score") or 1.0)
            else:
                text = str(item).strip()
                score = 1.0
            if text:
                hits.append(MemoryHit(text=text, score=score))
        return hits[: max(1, limit)]


def get_memory_backend() -> MemoryBackend:
    if mem0_enabled():
        try:
            return Mem0Memory()
        except Exception:
            # Never block diagnostics if Mem0/vector store is misconfigured.
            return LocalJsonMemory()
    return LocalJsonMemory()


def _mem0_config() -> dict[str, object] | None:
    """Build Mem0 config from env; None means library defaults."""

    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not openai_key:
        return None
    store_path = str(memory_data_dir() / "qdrant")
    return {
        "llm": {
            "provider": "openai",
            "config": {
                "model": os.environ.get("OPENAI_MODEL", "").strip() or "gpt-4o-mini",
                "temperature": 0.1,
                "api_key": openai_key,
            },
        },
        "embedder": {
            "provider": "openai",
            "config": {
                "model": "text-embedding-3-small",
                "api_key": openai_key,
            },
        },
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "collection_name": "bintu_memories",
                "embedding_model_dims": 1536,
                "path": store_path,
                "on_disk": True,
            },
        },
        "version": "v1.1",
    }


def _tokens(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-zA-ZÀ-ÿ0-9_]{3,}", text.lower())}


def _overlap(query: set[str], document: set[str]) -> float:
    if not query or not document:
        return 0.0
    return len(query & document) / len(query)
