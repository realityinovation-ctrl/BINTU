import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { InvestigationState } from "../../src/core/models";
import {
  canonicalJson,
  deserializeState,
  serializeState,
  sortKeys,
} from "../../src/infrastructure/stateJson";

const root = path.resolve(import.meta.dirname, "../../..");
const python = path.join(root, ".venv", "Scripts", "python.exe");

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
        if (isSystemState(candidate)) {
          states.push(candidate);
        }
      }
    }
  }
  return states;
}

function isSystemState(value: unknown): value is InvestigationState {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.investigation_id === "string" &&
    record.system !== null &&
    typeof record.system === "object"
  );
}

function pythonSerializations(states: InvestigationState[]): string[] {
  const script = `
import json, sys
from bintu_agent_core.models import InvestigationState
from bintu_agent_core.sqlite_store import _serialize_state
states = json.load(sys.stdin)
json.dump([
    _serialize_state(InvestigationState.model_validate(item))
    for item in states
], sys.stdout)
`;
  const result = spawnSync(python, ["-X", "utf8", "-c", script], {
    cwd: root,
    input: JSON.stringify(states),
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "python serialization failed");
  }
  return JSON.parse(result.stdout) as string[];
}

describe("state json", () => {
  it("matches the python snapshot after parsing, including evidence key order", () => {
    const states = fixtureStates();
    expect(states.length).toBeGreaterThan(60);
    const reference = pythonSerializations(states);
    expect(reference).toHaveLength(states.length);
    for (const [index, state] of states.entries()) {
      const node = serializeState(state);
      const pythonText = reference[index] ?? "";
      expect(canonicalJson(JSON.parse(node))).toBe(canonicalJson(JSON.parse(pythonText)));
      const nodeEvidence = Object.keys(
        (JSON.parse(node) as { evidence: Record<string, unknown> }).evidence,
      );
      const pythonEvidence = Object.keys(
        (JSON.parse(pythonText) as { evidence: Record<string, unknown> }).evidence,
      );
      expect(nodeEvidence).toEqual(pythonEvidence);
      const reread = deserializeState(node, state.investigation_id, state.status);
      expect(Object.keys(reread.evidence)).toEqual(pythonEvidence);
    }
  });

  it("keeps prefixed evidence keys in lexicographic order", () => {
    const text = JSON.stringify(
      sortKeys({ "m-2": { id: "m-2" }, "m-10": { id: "m-10" }, "m-1": { id: "m-1" } }),
    );
    expect(Object.keys(JSON.parse(text) as Record<string, unknown>)).toEqual([
      "m-1",
      "m-10",
      "m-2",
    ]);
  });

  it("documents that bare numeric keys are reordered by JavaScript", () => {
    // Python sort_keys emits "10" before "2". After JSON.parse, a JavaScript
    // object lists integer indexes in numeric order, so the reread is "2"
    // then "10". Evidence identifiers in BINTU are prefixed and avoid this.
    const pythonOrder = '{"10":1,"2":2}';
    expect(Object.keys(JSON.parse(pythonOrder) as Record<string, unknown>)).toEqual([
      "2",
      "10",
    ]);
  });
});
