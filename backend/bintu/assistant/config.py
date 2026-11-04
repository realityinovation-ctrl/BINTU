"""Feature flags for contextual memory (Mem0 / LangGraph / local)."""

from __future__ import annotations

import os
from pathlib import Path


def _flag(name: str, default: str = "1") -> bool:
    raw = os.environ.get(name, default).strip().lower()
    return raw not in {"0", "false", "no", "off", ""}


def assistant_enabled() -> bool:
    return _flag("BINTU_ASSISTANT_MEMORY", "1")


def mem0_enabled() -> bool:
    return _flag("BINTU_MEM0", "0")


def summary_event_threshold() -> int:
    raw = os.environ.get("BINTU_MEMORY_SUMMARY_EVENTS", "12").strip() or "12"
    try:
        value = int(raw)
    except ValueError:
        return 12
    return max(6, value)


def memory_data_dir() -> Path:
    configured = os.environ.get("BINTU_MEMORY_DIR", "").strip()
    if configured:
        path = Path(configured)
    else:
        path = Path(__file__).resolve().parents[2] / ".memory"
    path.mkdir(parents=True, exist_ok=True)
    return path
