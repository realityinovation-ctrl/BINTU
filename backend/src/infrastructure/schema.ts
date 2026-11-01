/** Investigations table, identical to the Python store. No extra column or index. */

import type Database from "better-sqlite3";

export const INVESTIGATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS investigations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL,
    state_json TEXT NOT NULL,
    organization_id TEXT,
    created_by_user_id TEXT,
    state_schema_version INTEGER NOT NULL DEFAULT 1,
    state_revision INTEGER NOT NULL DEFAULT 1
)
`;

const COLUMN_ADDITIONS: readonly (readonly [string, string])[] = [
  ["organization_id", "ALTER TABLE investigations ADD COLUMN organization_id TEXT"],
  [
    "created_by_user_id",
    "ALTER TABLE investigations ADD COLUMN created_by_user_id TEXT",
  ],
  [
    "state_schema_version",
    "ALTER TABLE investigations ADD COLUMN state_schema_version INTEGER NOT NULL DEFAULT 1",
  ],
  [
    "state_revision",
    "ALTER TABLE investigations ADD COLUMN state_revision INTEGER NOT NULL DEFAULT 1",
  ],
];

export function ensureInvestigationColumns(database: Database.Database): void {
  const existing = new Set(
    database
      .prepare("PRAGMA table_info(investigations)")
      .all()
      .map((row) => String((row as { name: string }).name)),
  );
  for (const [name, statement] of COLUMN_ADDITIONS) {
    if (!existing.has(name)) {
      database.exec(statement);
    }
  }
}
