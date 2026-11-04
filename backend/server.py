"""Launch the BINTU API.

From the backend folder:

    python server.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
os.environ["PYTHONPATH"] = (
    str(ROOT) + os.pathsep + os.environ.get("PYTHONPATH", "")
).rstrip(os.pathsep)


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main() -> None:
    load_env_file(ROOT / ".env")
    import uvicorn

    host = os.environ.get("BINTU_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.environ.get("BINTU_PORT", "8000").strip() or "8000")
    reload_enabled = os.environ.get("BINTU_RELOAD", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    uvicorn.run(
        "bintu.api.app:create_app",
        factory=True,
        host=host,
        port=port,
        reload=reload_enabled,
    )


if __name__ == "__main__":
    main()
