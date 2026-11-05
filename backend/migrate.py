"""Apply or inspect MySQL schema migrations.

From the backend folder (same .env as server.py):

    python migrate.py
    python migrate.py --status
    python migrate.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main(argv: list[str] | None = None) -> int:
    load_env_file(ROOT / ".env")
    parser = argparse.ArgumentParser(description="BINTU MySQL schema migrations")
    parser.add_argument(
        "--status",
        action="store_true",
        help="List applied and pending migrations without applying",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show which migrations would run",
    )
    args = parser.parse_args(argv)

    from bintu.persistence.schema_migrate import apply_migrations, status

    if args.status:
        report = status()
        print("available:", ", ".join(report["available"]) or "(none)")
        print("applied:", ", ".join(report["applied"]) or "(none)")
        print("pending:", ", ".join(report["pending"]) or "(none)")
        return 0

    applied = apply_migrations(dry_run=args.dry_run)
    if not applied:
        print("No pending migrations.")
        return 0
    prefix = "Would apply" if args.dry_run else "Applied"
    print(f"{prefix}: {', '.join(applied)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
