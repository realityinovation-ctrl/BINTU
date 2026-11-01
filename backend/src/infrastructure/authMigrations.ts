import type Database from "better-sqlite3";

/**
 * Auth tables only. The investigations table is intentionally absent:
 * these statements must stay replayable on a database that already has it.
 */
export const AUTH_MIGRATIONS: readonly { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "auth-accounts",
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        disabled_at TEXT
      );
      CREATE TABLE organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE memberships (
        user_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, organization_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id)
      );
      CREATE TABLE sessions (
        id_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        csrf_token_hash TEXT,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id)
      );
      CREATE TABLE invitations (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
        code_hash TEXT NOT NULL UNIQUE,
        created_by TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        FOREIGN KEY (organization_id) REFERENCES organizations(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
    `,
  },
];

export function migrateAuth(database: Database.Database, appliedAt: string): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
  const existing = new Set(
    database
      .prepare("SELECT id FROM schema_migrations")
      .all()
      .map((row) => Number((row as { id: number }).id)),
  );
  const insert = database.prepare(
    "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
  );
  for (const migration of AUTH_MIGRATIONS) {
    if (existing.has(migration.id)) {
      continue;
    }
    database.transaction(() => {
      database.exec(migration.sql);
      insert.run(migration.id, migration.name, appliedAt);
    })();
  }
}
