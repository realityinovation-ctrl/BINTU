/**
 * Copy data/bintu.sqlite3, read the six rows, write them again into a
 * second copy, and compare. The original file is never opened for writing.
 */

import { copyFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

import { dumpState } from "../src/core/models";
import { canonicalJson, serializeState } from "../src/infrastructure/stateJson";
import {
  SqliteDiagnosticRepository,
  type StoredInvestigation,
} from "../src/infrastructure/sqliteDiagnosticRepository";

const root = path.resolve(import.meta.dirname, "../..");
const source = path.join(root, "data", "bintu.sqlite3");
const temporary = path.join(root, "backend", "tmp");
const sourceCopy = path.join(temporary, "legacy-source.sqlite3");
const rewrittenCopy = path.join(temporary, "legacy-rewrite.sqlite3");

function storedForm(stateJson: string): string {
  const payload = JSON.parse(stateJson) as Record<string, unknown>;
  if ("installation" in payload && !("system" in payload)) {
    return "installation";
  }
  if ("system" in payload) {
    return "system";
  }
  return "autre";
}

function sameState(left: StoredInvestigation, right: StoredInvestigation): boolean {
  return canonicalJson(dumpState(left.state)) === canonicalJson(dumpState(right.state));
}

function sameRow(left: StoredInvestigation, right: StoredInvestigation): boolean {
  return (
    left.id === right.id &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.status === right.status &&
    left.organizationId === right.organizationId &&
    left.createdByUserId === right.createdByUserId &&
    left.stateSchemaVersion === right.stateSchemaVersion &&
    left.stateRevision === right.stateRevision &&
    sameState(left, right)
  );
}

function display(value: string | null): string {
  return value ?? "(aucune)";
}

mkdirSync(temporary, { recursive: true });
for (const file of [sourceCopy, rewrittenCopy]) {
  rmSync(file, { force: true });
  rmSync(`${file}-wal`, { force: true });
  rmSync(`${file}-shm`, { force: true });
}

const before = statSync(source);
copyFileSync(source, sourceCopy);

const sourceRepository = new SqliteDiagnosticRepository(sourceCopy);
const originalRows = sourceRepository.readAll();
sourceRepository.close();

const targetRepository = new SqliteDiagnosticRepository(rewrittenCopy);
for (const row of originalRows) {
  targetRepository.insertRaw({
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: row.status,
    stateJson: serializeState(row.state),
    organizationId: row.organizationId,
    createdByUserId: row.createdByUserId,
    stateSchemaVersion: row.stateSchemaVersion,
    stateRevision: row.stateRevision,
  });
}
const rewrittenRows = targetRepository.readAll();
targetRepository.close();

const after = statSync(source);
if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
  throw new Error("data/bintu.sqlite3 a été modifié");
}

const rewrittenById = new Map(rewrittenRows.map((row) => [row.id, row]));
const table = originalRows.map((row) => {
  const rewritten = rewrittenById.get(row.id);
  const equal = rewritten !== undefined && sameRow(row, rewritten);
  return {
    id: row.id,
    forme: `${storedForm(row.stateJson)} -> ${rewritten === undefined ? "absente" : storedForm(rewritten.stateJson)}`,
    statut: row.status,
    organisation: display(row.organizationId),
    utilisateur: display(row.createdByUserId),
    revision: row.stateRevision,
    etat: equal ? "identique" : "écart",
  };
});

console.table(table);

const mismatches = table.filter((row) => row.etat !== "identique");
if (originalRows.length !== 6 || rewrittenRows.length !== 6 || mismatches.length > 0) {
  console.error(
    `${mismatches.length} écart(s), ${originalRows.length} ligne(s) lues, ${rewrittenRows.length} réécrites.`,
  );
  process.exitCode = 1;
} else {
  console.log("6 lignes identiques après réécriture.");
}
