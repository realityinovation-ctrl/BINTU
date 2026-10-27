import ast
from pathlib import Path


CORE = Path(__file__).parents[1] / "src" / "bintu_agent_core"
FORBIDDEN_IMPORTS = {
    "fastapi",
    "httpx",
    "meta",
    "openai",
    "requests",
    "sqlite3",
}


def test_core_has_no_framework_network_storage_or_meta_imports() -> None:
    imported_roots: set[str] = set()
    for source_file in CORE.glob("*.py"):
        tree = ast.parse(source_file.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported_roots.update(
                    alias.name.partition(".")[0] for alias in node.names
                )
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported_roots.add(node.module.partition(".")[0])

    assert imported_roots.isdisjoint(FORBIDDEN_IMPORTS)
