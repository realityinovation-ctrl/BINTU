import Database from "better-sqlite3";

import { describe, expect, it } from "vitest";

import {
  INVESTIGATIONS_TABLE,
  ensureInvestigationColumns,
} from "../../src/infrastructure/schema";

describe("investigation schema", () => {
  it("creates the python columns and no extra index", () => {
    const database = new Database(":memory:");
    database.exec(INVESTIGATIONS_TABLE);
    ensureInvestigationColumns(database);
    const columns = database.prepare("PRAGMA table_info(investigations)").all() as {
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }[];
    expect(columns.map((column) => [column.name, column.type, column.notnull, column.pk])).toEqual([
      ["id", "TEXT", 0, 1],
      ["created_at", "TEXT", 1, 0],
      ["updated_at", "TEXT", 1, 0],
      ["status", "TEXT", 1, 0],
      ["state_json", "TEXT", 1, 0],
      ["organization_id", "TEXT", 0, 0],
      ["created_by_user_id", "TEXT", 0, 0],
      ["state_schema_version", "INTEGER", 1, 0],
      ["state_revision", "INTEGER", 1, 0],
    ]);
    const indexes = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as { name: string }[];
    expect(indexes.map((index) => index.name)).toEqual([
      "sqlite_autoindex_investigations_1",
    ]);
    database.close();
  });

  it("adds the ownership columns when opening an older table", () => {
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE investigations (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          status TEXT NOT NULL,
          state_json TEXT NOT NULL
      )
    `);
    ensureInvestigationColumns(database);
    const names = database
      .prepare("PRAGMA table_info(investigations)")
      .all()
      .map((row) => String((row as { name: string }).name));
    expect(names).toEqual([
      "id",
      "created_at",
      "updated_at",
      "status",
      "state_json",
      "organization_id",
      "created_by_user_id",
      "state_schema_version",
      "state_revision",
    ]);
    database.close();
  });
});
