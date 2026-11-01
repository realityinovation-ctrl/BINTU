import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { InvestigationEngine } from "../../src/core/engine";
import {
  InvestigationNotFoundError,
  PersistenceError,
  StateCorruptionError,
} from "../../src/core/errors";
import { MockAIProvider } from "../../src/core/mockProvider";
import { parseDecision, type InvestigationState } from "../../src/core/models";
import type { AIProvider, ProviderCapabilities } from "../../src/core/ports/aiProvider";
import { canonicalJson } from "../../src/infrastructure/stateJson";
import {
  LIST_LIMIT,
  SqliteDiagnosticRepository,
  type RawInvestigationRow,
} from "../../src/infrastructure/sqliteDiagnosticRepository";

const unavailable: ProviderCapabilities = {
  reasoning_structured: false,
  vision: false,
  asr_streaming: false,
  tts: false,
  native_live: false,
};

class OneQuestion implements AIProvider {
  capabilities(): ProviderCapabilities {
    return unavailable;
  }

  decideNext(): ReturnType<AIProvider["decideNext"]> {
    return parseDecision({
      tool_name: "ask_technician",
      reason: "Obtenir une observation manquante.",
      arguments: {
        question: "Depuis quand ?",
        distinguishes: ["H0", "H1"],
      },
    });
  }
}

const repositories: SqliteDiagnosticRepository[] = [];
const directories: string[] = [];

function open(filename = ":memory:"): SqliteDiagnosticRepository {
  const repository = new SqliteDiagnosticRepository(filename);
  repositories.push(repository);
  return repository;
}

function row(partial: Partial<RawInvestigationRow> & Pick<RawInvestigationRow, "id" | "stateJson">): RawInvestigationRow {
  return {
    createdAt: "2026-01-01T00:00:00.000000+00:00",
    updatedAt: "2026-01-01T00:00:00.000000+00:00",
    status: "investigating",
    organizationId: "org-alpha",
    createdByUserId: "user-alpha",
    stateSchemaVersion: 1,
    stateRevision: 1,
    ...partial,
  };
}

afterEach(() => {
  for (const repository of repositories.splice(0)) {
    repository.close();
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("sqlite diagnostic repository", () => {
  it("creates revision 1 and reaches revision 2 after the first decision", () => {
    const repository = open();
    const state = repository.create("org-alpha", "user-alpha");
    expect(repository.readAll()[0]?.stateRevision).toBe(1);
    state.problem = { description: "La production est anormalement faible." };
    new InvestigationEngine(state, new OneQuestion()).advance();
    repository.save(state, "org-alpha");
    const stored = repository.readAll()[0];
    expect(stored?.stateRevision).toBe(2);
    expect(stored?.state.step_count).toBe(1);
    expect(stored?.state.status).toBe("waiting_for_technician");
  });

  it("increments the revision on every save without comparing it", () => {
    const repository = open();
    const state = repository.create("org-alpha", "user-alpha");
    repository.save(state, "org-alpha");
    repository.save(state, "org-alpha");
    expect(repository.readAll()[0]?.stateRevision).toBe(3);
  });

  it("deletes the row when the first decision fails", () => {
    const repository = open();
    const state = repository.create("org-alpha", "user-alpha");
    state.problem = { description: "La production est anormalement faible." };
    expect(() => new InvestigationEngine(state, new MockAIProvider()).advance()).toThrow(
      /mock decision script is exhausted/,
    );
    repository.delete(state.investigation_id, "org-alpha");
    expect(() => repository.get(state.investigation_id, "org-alpha")).toThrow(
      InvestigationNotFoundError,
    );
    expect(repository.list("org-alpha")).toEqual([]);
    expect(repository.readAll()).toEqual([]);
  });

  it("hides another organization and an unknown id behind the same absence", () => {
    const repository = open();
    const state = repository.create("org-alpha", "user-alpha");
    expect(() => repository.get(state.investigation_id, "org-beta")).toThrow(
      InvestigationNotFoundError,
    );
    expect(() => repository.get("missing", "org-alpha")).toThrow(
      /investigation not found: missing/,
    );
    expect(() => repository.save(state, "org-beta")).toThrow(InvestigationNotFoundError);
    expect(() => repository.delete(state.investigation_id, "org-beta")).toThrow(
      InvestigationNotFoundError,
    );
    expect(repository.get(state.investigation_id, "org-alpha").investigation_id).toBe(
      state.investigation_id,
    );
    expect(repository.readAll()[0]?.stateRevision).toBe(1);
  });

  it("lists the twenty most recently updated investigations of one organization", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "bintu-repo-"));
    directories.push(directory);
    const filename = path.join(directory, "investigations.sqlite3");
    const repository = open(filename);
    const ids: string[] = [];
    for (let index = 0; index < 21; index += 1) {
      ids.push(repository.create("org-alpha", "user-alpha").investigation_id);
    }
    repository.create("org-beta", "user-beta");
    const editor = new Database(filename);
    const update = editor.prepare(
      "UPDATE investigations SET updated_at = ? WHERE id = ?",
    );
    ids.forEach((id, index) => {
      const day = String(index + 1).padStart(2, "0");
      update.run(`2026-01-${day}T00:00:00.000000+00:00`, id);
    });
    editor.close();

    const listed = repository.list("org-alpha");
    expect(LIST_LIMIT).toBe(20);
    expect(listed).toHaveLength(20);
    expect(listed[0]?.id).toBe(ids[20]);
    expect(listed.map((item) => item.id)).not.toContain(ids[0]);
    expect(repository.list("org-beta")).toHaveLength(1);
    expect(() => repository.list("org-alpha", 0)).toThrow(
      /limit must be a positive integer/,
    );
  });

  it("rejects an empty owner and a snapshot that would invent a default", () => {
    const repository = open();
    expect(() => repository.create("", "user-alpha")).toThrow(PersistenceError);
    expect(() => repository.create("org-alpha", "")).toThrow(
      /investigation owner is required/,
    );
    const state = repository.create("org-alpha", "user-alpha");
    const payload = JSON.parse(repository.readAll()[0]?.stateJson ?? "{}") as Record<
      string,
      unknown
    >;
    const missingTimeline = { ...payload };
    delete missingTimeline.timeline;
    repository.insertRaw(
      row({
        id: "parity-missing-timeline",
        stateJson: JSON.stringify({
          ...missingTimeline,
          investigation_id: "parity-missing-timeline",
        }),
      }),
    );
    expect(() => repository.get("parity-missing-timeline", "org-alpha")).toThrow(
      StateCorruptionError,
    );
    expect(() => repository.get("parity-missing-timeline", "org-alpha")).toThrow(
      /state_json would require reconstruction or default values/,
    );
    repository.insertRaw(
      row({
        id: "parity-bad-json",
        stateJson: "{",
      }),
    );
    expect(() => repository.get("parity-bad-json", "org-alpha")).toThrow(
      /state_json is not valid JSON/,
    );
    repository.insertRaw(
      row({
        id: "parity-bad-version",
        stateJson: JSON.stringify({ ...payload, schema_version: 2 }),
      }),
    );
    expect(() => repository.get("parity-bad-version", "org-alpha")).toThrow(
      /unsupported schema_version: 2/,
    );
    repository.insertRaw(
      row({
        id: "parity-status",
        status: "completed",
        stateJson: JSON.stringify({ ...payload, investigation_id: "parity-status" }),
      }),
    );
    expect(() => repository.get("parity-status", "org-alpha")).toThrow(
      /state_json status does not match its database row/,
    );
    expect(repository.get(state.investigation_id, "org-alpha").status).toBe(
      "investigating",
    );
  });

  it("round-trips a stored system snapshot without reordering prefixed evidence", () => {
    const repository = open();
    const created = repository.create("org-alpha", "user-alpha");
    const state: InvestigationState = {
      ...created,
      evidence: {
        "m-2": {
          id: "m-2",
          observation_id: "observation:m-2",
          source_type: "measurement",
          source_id: "m-2",
          certainty: null,
        },
        "m-1": {
          id: "m-1",
          observation_id: "observation:m-1",
          source_type: "measurement",
          source_id: "m-1",
          certainty: null,
        },
      },
    };
    repository.save(state, "org-alpha");
    const stored = repository.readAll().find((item) => item.id === created.investigation_id);
    const reread = repository.get(created.investigation_id, "org-alpha");
    expect(Object.keys(reread.evidence)).toEqual(["m-1", "m-2"]);
    expect(canonicalJson(reread)).toBe(canonicalJson(stored?.state));
  });
});
