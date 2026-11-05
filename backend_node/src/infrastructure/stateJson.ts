/**
 * Lossless snapshot JSON, matching Python json.dumps(sort_keys=True,
 * ensure_ascii=False, separators=(",", ":")).
 *
 * Evidence key order is the sorted order, including after a reread.
 * Bare numeric keys are a known limit: a JavaScript object enumerates
 * integer indexes in numeric order, so "10" is read back before "2"
 * even when the JSON text follows Python's lexicographic sort.
 * Current evidence identifiers are prefixed, so they are not integer indexes.
 */

import { StateCorruptionError } from "../core/errors";
import { normalizeLegacySystem } from "../core/legacySystem";
import { dumpState, parseState, type InvestigationState } from "../core/models";

export const SCHEMA_VERSION = 1;

export function serializeState(state: InvestigationState): string {
  const payload = {
    schema_version: SCHEMA_VERSION,
    ...(dumpState(state) as Record<string, unknown>),
  };
  return JSON.stringify(sortKeys(payload));
}

export function deserializeState(
  stateJson: string,
  expectedId: string,
  expectedStatus: string,
): InvestigationState {
  let payload: unknown;
  try {
    payload = JSON.parse(stateJson);
  } catch {
    throw new StateCorruptionError("state_json is not valid JSON");
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new StateCorruptionError("state_json must contain a JSON object");
  }
  const record = payload as Record<string, unknown>;
  if (record.schema_version !== SCHEMA_VERSION) {
    throw new StateCorruptionError(
      `unsupported schema_version: ${pythonRepr(record.schema_version)}`,
    );
  }
  const statePayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== "schema_version") {
      statePayload[key] = value;
    }
  }
  return restoreState(normalizeLegacySystem(statePayload), expectedId, expectedStatus);
}

export function restoreState(
  statePayload: Record<string, unknown>,
  expectedId: string,
  expectedStatus: string,
): InvestigationState {
  let restored: InvestigationState;
  try {
    restored = parseState(statePayload);
  } catch {
    throw new StateCorruptionError("state_json does not match InvestigationState");
  }
  if (canonicalJson(dumpState(restored)) !== canonicalJson(statePayload)) {
    throw new StateCorruptionError(
      "state_json would require reconstruction or default values",
    );
  }
  if (restored.investigation_id !== expectedId) {
    throw new StateCorruptionError(
      "state_json investigation_id does not match its database row",
    );
  }
  if (restored.status !== expectedStatus) {
    throw new StateCorruptionError(
      "state_json status does not match its database row",
    );
  }
  return restored;
}

export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeys(item));
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function pythonRepr(value: unknown): string {
  if (value === null || value === undefined) {
    return "None";
  }
  if (typeof value === "string") {
    return `'${value}'`;
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  return String(value);
}
