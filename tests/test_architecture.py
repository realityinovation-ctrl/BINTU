import ast
from pathlib import Path


CORE = Path(__file__).parents[1] / "src" / "bintu_agent_core"
FORBIDDEN_IMPORTS = {
    "fastapi",
    "meta",
    "openai",
    "requests",
}


def imported_roots(source_file: Path) -> set[str]:
    roots: set[str] = set()
    tree = ast.parse(source_file.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(
                alias.name.partition(".")[0] for alias in node.names
            )
        elif isinstance(node, ast.ImportFrom) and node.module:
            roots.add(node.module.partition(".")[0])
    return roots


def test_core_has_no_framework_storage_or_vendor_sdk_imports() -> None:
    all_imports: set[str] = set()
    for source_file in CORE.glob("*.py"):
        all_imports.update(imported_roots(source_file))

    assert all_imports.isdisjoint(FORBIDDEN_IMPORTS)


def test_http_client_is_isolated_to_meta_adapter() -> None:
    importing_httpx = {
        source_file.name
        for source_file in CORE.glob("*.py")
        if "httpx" in imported_roots(source_file)
    }

    assert importing_httpx == {"meta_provider.py"}


def test_sqlite_is_isolated_to_persistence_adapter() -> None:
    importing_sqlite = {
        source_file.name
        for source_file in CORE.glob("*.py")
        if "sqlite3" in imported_roots(source_file)
    }

    assert importing_sqlite == {"sqlite_store.py"}
