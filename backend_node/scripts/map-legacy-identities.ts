/**
 * Point legacy investigation identifiers at accounts.
 * The default is a simulation on a copy. Rows are never deleted.
 * data/bintu.sqlite3 is never opened for writing.
 */

import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const root = path.resolve(import.meta.dirname, "../..");

export const DEFAULT_SOURCE = path.join(root, "data", "bintu.sqlite3");
export const DEFAULT_COPY = path.join(
  root,
  "backend",
  "tmp",
  "legacy-identity-copy.sqlite3",
);

export const ORGANIZATION_UPDATE =
  "UPDATE investigations SET organization_id = ? WHERE organization_id = ?";
export const USER_UPDATE =
  "UPDATE investigations SET created_by_user_id = ? WHERE created_by_user_id = ?";

export interface IdentityMapping {
  organizations: Record<string, string>;
  users: Record<string, string>;
}

export interface IdentityMatch {
  from: string;
  to: string;
  matched: number;
}

export interface IdentityReport {
  mode: "simulation" | "apply";
  copy: string;
  deleted: 0;
  total: number;
  unassigned: number;
  organizations: IdentityMatch[];
  users: IdentityMatch[];
}

export function readIdentityMapping(text: string): IdentityMapping {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("mapping file is not valid");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("mapping file is not valid");
  }
  const record = parsed as Record<string, unknown>;
  return {
    organizations: pairs(record.organizations),
    users: pairs(record.users),
  };
}

export function mapLegacyIdentities(options: {
  source: string;
  copy: string;
  mapping: IdentityMapping;
  apply: boolean;
}): IdentityReport {
  if (path.resolve(options.source) === path.resolve(options.copy)) {
    throw new Error("the working copy must be a different file");
  }
  const before = statSync(options.source);
  rmSync(options.copy, { force: true });
  rmSync(`${options.copy}-wal`, { force: true });
  rmSync(`${options.copy}-shm`, { force: true });
  mkdirSync(path.dirname(options.copy), { recursive: true });
  copyFileSync(options.source, options.copy);

  let report: IdentityReport | undefined;
  let failure: unknown;
  const database = new Database(options.copy);
  try {
    database.pragma("foreign_keys = ON");
    const totalBefore = count(database, "SELECT COUNT(*) AS n FROM investigations");
    const unassignedBefore = count(
      database,
      "SELECT COUNT(*) AS n FROM investigations WHERE organization_id IS NULL",
    );
    const organizations = options.apply
      ? writeMatches(database, ORGANIZATION_UPDATE, options.mapping.organizations)
      : readMatches(database, "organization_id", options.mapping.organizations);
    const users = options.apply
      ? writeMatches(database, USER_UPDATE, options.mapping.users)
      : readMatches(database, "created_by_user_id", options.mapping.users);
    const totalAfter = count(database, "SELECT COUNT(*) AS n FROM investigations");
    const unassignedAfter = count(
      database,
      "SELECT COUNT(*) AS n FROM investigations WHERE organization_id IS NULL",
    );
    if (totalAfter !== totalBefore || unassignedAfter !== unassignedBefore) {
      throw new Error("identity mapping changed the number of investigations");
    }
    report = {
      mode: options.apply ? "apply" : "simulation",
      copy: options.copy,
      deleted: 0,
      total: totalAfter,
      unassigned: unassignedAfter,
      organizations,
      users,
    };
  } catch (error) {
    failure = error;
  } finally {
    database.close();
  }
  const after = statSync(options.source);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error("the source database was modified");
  }
  if (failure !== undefined) {
    throw failure;
  }
  if (report === undefined) {
    throw new Error("identity mapping failed");
  }
  return report;
}

export function main(argv: string[]): IdentityReport {
  const options = parseArgs(argv);
  const mapping = readIdentityMapping(readFileSync(options.mapping, "utf8"));
  return mapLegacyIdentities({
    source: options.source,
    copy: options.copy,
    mapping,
    apply: options.apply,
  });
}

function parseArgs(argv: string[]): {
  mapping: string;
  source: string;
  copy: string;
  apply: boolean;
} {
  let mapping = "";
  let source = DEFAULT_SOURCE;
  let copy = DEFAULT_COPY;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--mapping") {
      mapping = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--source") {
      source = requiredValue(argv, index);
      index += 1;
    } else if (arg === "--copy") {
      copy = requiredValue(argv, index);
      index += 1;
    } else {
      throw new Error("unknown argument");
    }
  }
  if (mapping === "") {
    throw new Error("mapping file is required");
  }
  return { mapping, source, copy, apply };
}

function requiredValue(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error("missing argument value");
  }
  return value;
}

function pairs(value: unknown): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("mapping file is not valid");
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.trim() === "" || typeof item !== "string" || item.trim() === "") {
      throw new Error("mapping file is not valid");
    }
    result[key] = item;
  }
  return result;
}

function readMatches(
  database: Database.Database,
  column: "organization_id" | "created_by_user_id",
  mapping: Record<string, string>,
): IdentityMatch[] {
  const statement = database.prepare(
    `SELECT COUNT(*) AS n FROM investigations WHERE ${column} = ?`,
  );
  return Object.entries(mapping).map(([from, to]) => ({
    from,
    to,
    matched: numberOf(statement.get(from)),
  }));
}

function writeMatches(
  database: Database.Database,
  sql: string,
  mapping: Record<string, string>,
): IdentityMatch[] {
  const statement = database.prepare(sql);
  return database.transaction(() =>
    Object.entries(mapping).map(([from, to]) => ({
      from,
      to,
      matched: statement.run(to, from).changes,
    })),
  )();
}

function count(database: Database.Database, sql: string): number {
  return numberOf(database.prepare(sql).get());
}

function numberOf(row: unknown): number {
  if (row !== null && typeof row === "object" && "n" in row) {
    return Number(row.n);
  }
  return 0;
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return entry.replaceAll("\\", "/").endsWith("backend/scripts/map-legacy-identities.ts");
}

if (invokedDirectly()) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "identity mapping failed");
    process.exitCode = 1;
  }
}
