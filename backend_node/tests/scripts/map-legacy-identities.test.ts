import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { SqliteDiagnosticRepository } from "../../src/infrastructure/sqliteDiagnosticRepository";
import {
  ORGANIZATION_UPDATE,
  USER_UPDATE,
  main,
  mapLegacyIdentities,
  readIdentityMapping,
} from "../../scripts/map-legacy-identities";

describe("legacy identity mapping", () => {
  it("simulates on a copy and updates only that copy", () => {
    expect(ORGANIZATION_UPDATE.includes("DELETE")).toBe(false);
    expect(USER_UPDATE.includes("DELETE")).toBe(false);
    const directory = mkdtempSync(path.join(tmpdir(), "bintu-legacy-"));
    const source = path.join(directory, "source.sqlite3");
    const simulated = path.join(directory, "simulated.sqlite3");
    const applied = path.join(directory, "applied.sqlite3");
    const mappingFile = path.join(directory, "mapping.json");
    const repository = new SqliteDiagnosticRepository(source);
    const stamp = "2026-01-01T00:00:00.000Z";
    const rows = [
      ["diag-mapped", "org_legacy_alpha", "user_legacy_ada"],
      ["diag-other", "org_legacy_beta", "user_legacy_bruno"],
      ["diag-unassigned", null, null],
    ] as const;
    for (const [id, organizationId, userId] of rows) {
      repository.insertRaw({
        id,
        createdAt: stamp,
        updatedAt: stamp,
        status: "investigating",
        stateJson: "{}",
        organizationId,
        createdByUserId: userId,
        stateSchemaVersion: 1,
        stateRevision: 0,
      });
    }
    repository.close();
    const mapping = {
      organizations: { org_legacy_alpha: "org_account_alpha" },
      users: { user_legacy_ada: "user_account_ada" },
    };
    writeFileSync(mappingFile, JSON.stringify(mapping));
    const before = createHash("sha256").update(readFileSync(source)).digest("hex");
    const sourceStat = statSync(source);

    const simulation = mapLegacyIdentities({
      source,
      copy: simulated,
      mapping,
      apply: false,
    });
    expect(simulation.mode).toBe("simulation");
    expect(simulation.deleted).toBe(0);
    expect(simulation.total).toBe(3);
    expect(simulation.unassigned).toBe(1);
    expect(simulation.organizations).toEqual([
      { from: "org_legacy_alpha", to: "org_account_alpha", matched: 1 },
    ]);
    expect(column(simulated, "diag-mapped", "organization_id")).toBe("org_legacy_alpha");

    const report = main([
      "--mapping",
      mappingFile,
      "--source",
      source,
      "--copy",
      applied,
      "--apply",
    ]);
    expect(report.mode).toBe("apply");
    expect(report.deleted).toBe(0);
    expect(report.unassigned).toBe(1);
    expect(column(applied, "diag-mapped", "organization_id")).toBe("org_account_alpha");
    expect(column(applied, "diag-mapped", "created_by_user_id")).toBe("user_account_ada");
    expect(column(applied, "diag-other", "organization_id")).toBe("org_legacy_beta");
    expect(column(applied, "diag-other", "created_by_user_id")).toBe("user_legacy_bruno");
    expect(column(applied, "diag-unassigned", "organization_id")).toBeNull();
    expect(column(applied, "diag-unassigned", "created_by_user_id")).toBeNull();
    expect(count(applied)).toBe(3);
    expect(createHash("sha256").update(readFileSync(source)).digest("hex")).toBe(before);
    expect(statSync(source).mtimeMs).toBe(sourceStat.mtimeMs);
    expect(() =>
      mapLegacyIdentities({ source, copy: source, mapping, apply: false }),
    ).toThrow("the working copy must be a different file");
    expect(() => readIdentityMapping("[]")).toThrow("mapping file is not valid");
    expect(() => main(["--source", source])).toThrow("mapping file is required");
    rmSync(directory, { recursive: true, force: true });
  });
});

function column(filename: string, id: string, name: string): string | null {
  const database = new Database(filename, { readonly: true });
  try {
    const row = database.prepare(`SELECT ${name} AS value FROM investigations WHERE id = ?`).get(id) as {
      value: string | null;
    };
    return row.value;
  } finally {
    database.close();
  }
}

function count(filename: string): number {
  const database = new Database(filename, { readonly: true });
  try {
    const row = database.prepare("SELECT COUNT(*) AS n FROM investigations").get() as { n: number };
    return row.n;
  } finally {
    database.close();
  }
}
