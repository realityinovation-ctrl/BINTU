import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { dumpState, type InvestigationState } from "../../src/core/models";
import { canonicalJson, serializeState } from "../../src/infrastructure/stateJson";
import {
  SqliteDiagnosticRepository,
  type RawInvestigationRow,
} from "../../src/infrastructure/sqliteDiagnosticRepository";

const root = path.resolve(import.meta.dirname, "../../..");
const repositories: SqliteDiagnosticRepository[] = [];

function open(): SqliteDiagnosticRepository {
  const repository = new SqliteDiagnosticRepository(":memory:");
  repositories.push(repository);
  return repository;
}

function stored(
  id: string,
  status: string,
  stateJson: string,
): RawInvestigationRow {
  return {
    id,
    createdAt: "2026-01-01T00:00:00.000000+00:00",
    updatedAt: "2026-01-01T00:00:00.000000+00:00",
    status,
    stateJson,
    organizationId: "org-alpha",
    createdByUserId: "user-alpha",
    stateSchemaVersion: 1,
    stateRevision: 1,
  };
}

function fixtureDocument(name: string): {
  input_state: Record<string, unknown>;
  expected: { state: InvestigationState };
} {
  return JSON.parse(
    readFileSync(path.join(root, "parity", "fixtures", "persistence", name), "utf8"),
  ) as {
    input_state: Record<string, unknown>;
    expected: { state: InvestigationState };
  };
}

function readBack(input: Record<string, unknown>): InvestigationState {
  const repository = open();
  const id = String(input.investigation_id);
  const status = String(input.status);
  repository.insertRaw(
    stored(id, status, JSON.stringify({ schema_version: 1, ...input })),
  );
  return repository.get(id, "org-alpha");
}

function fixtureStates(): InvestigationState[] {
  const directory = path.join(root, "parity", "fixtures");
  const states: InvestigationState[] = [];
  for (const category of readdirSync(directory)) {
    const folder = path.join(directory, category);
    for (const name of readdirSync(folder)) {
      if (!name.endsWith(".json")) {
        continue;
      }
      const document = JSON.parse(readFileSync(path.join(folder, name), "utf8")) as {
        input_state?: unknown;
        expected?: { state?: unknown };
      };
      for (const candidate of [document.input_state, document.expected?.state]) {
        if (
          candidate !== null &&
          typeof candidate === "object" &&
          !Array.isArray(candidate) &&
          typeof (candidate as { system?: unknown }).system === "object" &&
          (candidate as { system?: unknown }).system !== null
        ) {
          states.push(candidate as InvestigationState);
        }
      }
    }
  }
  return states;
}

afterEach(() => {
  for (const repository of repositories.splice(0)) {
    repository.close();
  }
});

describe("stored state shapes", () => {
  it("drops null installation fields and keeps the known values", () => {
    const document = fixtureDocument("legacy_installation.json");
    const restored = readBack(document.input_state);
    expect(canonicalJson(restored)).toBe(canonicalJson(document.expected.state));
    expect(restored.system).toEqual({
      domain: "photovoltaic",
      type: "photovoltaic_installation",
      manufacturer: null,
      model: null,
      characteristics: {
        battery_present: false,
        panel_count: 12,
      },
    });
  });

  it("leaves a document that already has a system unchanged", () => {
    const document = fixtureDocument("legacy_system_passthrough.json");
    const restored = readBack(document.input_state);
    expect(canonicalJson(restored)).toBe(canonicalJson(document.expected.state));
    expect(restored.system.domain).toBe("photovoltaic");
  });

  it("round-trips an electric motor and every other fixture state", () => {
    const motor = fixtureDocument("electric_motor.json");
    const restored = readBack(motor.input_state);
    expect(canonicalJson(restored)).toBe(canonicalJson(motor.expected.state));
    expect(restored.system).toMatchObject({
      domain: "electrical",
      type: "electric_motor",
    });

    const repository = open();
    for (const state of fixtureStates()) {
      repository.insertRaw(
        stored(state.investigation_id, state.status, serializeState(state)),
      );
      const reread = repository.get(state.investigation_id, "org-alpha");
      expect(canonicalJson(dumpState(reread))).toBe(canonicalJson(dumpState(state)));
      expect(Object.keys(reread.evidence)).toEqual(Object.keys(state.evidence).sort());
      repository.delete(state.investigation_id, "org-alpha");
    }
  });
});
