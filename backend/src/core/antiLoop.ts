/** Reject an action already tried when no later evidence justifies it. */

import { DecisionValidationError } from "./errors";
import type { AgentDecision, InvestigationState } from "./models";

export function actionSignature(decision: AgentDecision): string[] | null {
  switch (decision.tool_name) {
    case "finish_investigation":
    case "generate_report":
      return null;
    case "ask_technician":
      return ["ask_technician", fold(decision.arguments.question)];
    case "request_measurement":
      return [
        "request_measurement",
        decision.arguments.measurement_type.trim(),
        decision.arguments.unit.trim(),
        fold(decision.arguments.location),
      ];
    case "analyze_image":
      return ["analyze_image", fold(decision.arguments.focus)];
    case "compare_measurements":
      return [
        "compare_measurements",
        ...[...decision.arguments.measurement_ids].sort(),
      ];
  }
}

export function assertDecisionIsNotRepetitive(
  state: InvestigationState,
  decision: AgentDecision,
): void {
  const signature = actionSignature(decision);
  if (signature === null) {
    return;
  }
  let lastMatch: InvestigationState["timeline"][number] | null = null;
  for (const event of state.timeline) {
    if (
      event.event_type === "decision_recorded" &&
      sameList(event.details.signature, signature)
    ) {
      lastMatch = event;
    }
  }
  if (lastMatch === null) {
    if (measurementRepeatWithoutLaterEvidence(state, signature)) {
      throw new DecisionValidationError(
        "repetitive action does not add diagnostic information",
      );
    }
    return;
  }
  const previous = stringSet(lastMatch.details.evidence_ids);
  const direct = directEvidence(state, lastMatch.details.action_id);
  const current = new Set(Object.keys(state.evidence));
  for (const id of previous) {
    current.delete(id);
  }
  for (const id of direct) {
    current.delete(id);
  }
  if (current.size === 0) {
    throw new DecisionValidationError(
      "repetitive action does not add diagnostic information",
    );
  }
}

function measurementRepeatWithoutLaterEvidence(
  state: InvestigationState,
  signature: string[],
): boolean {
  if (signature[0] !== "request_measurement") {
    return false;
  }
  const measurementType = signature[1];
  const unit = signature[2];
  const location = signature[3];
  if (
    measurementType === undefined ||
    unit === undefined ||
    location === undefined
  ) {
    return false;
  }
  for (const measurement of Object.values(state.measurements)) {
    if (
      measurement.measurement_type === measurementType &&
      measurement.unit === unit &&
      fold(measurement.location) === location &&
      evidenceAfter(state, measurement.id).size === 0
    ) {
      return true;
    }
  }
  return false;
}

function evidenceAfter(state: InvestigationState, evidenceId: string): Set<string> {
  const keys = Object.keys(state.evidence);
  const index = keys.indexOf(evidenceId);
  if (index < 0) {
    return new Set();
  }
  return new Set(keys.slice(index + 1));
}

function directEvidence(state: InvestigationState, actionId: unknown): Set<string> {
  if (typeof actionId !== "string") {
    return new Set();
  }
  const evidenceIds = new Set<string>();
  for (const verification of Object.values(state.verifications)) {
    if (verification.action_id === actionId) {
      for (const evidenceId of verification.evidence_ids) {
        evidenceIds.add(evidenceId);
      }
    }
  }
  return evidenceIds;
}

function stringSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) {
    return new Set();
  }
  return new Set(value.filter((item): item is string => typeof item === "string"));
}

function sameList(value: unknown, expected: string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function fold(value: string): string {
  const parts = value.trim().split(/\s+/u).filter((part) => part.length > 0);
  return parts.join(" ").toLowerCase();
}
