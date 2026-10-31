/** Backend-enforced decision and electrical-safety guardrails. */

import { DecisionValidationError, SafetyViolationError } from "./errors";
import { MEASUREMENT_CATALOG } from "./measurementCatalog";
import type { AgentDecision, InvestigationState } from "./models";
import { pythonList, pythonQuoted } from "./pythonFormat";

export const HIGH_CONFIDENCE_LIMIT = 0.7;

export function validateDecision(
  state: InvestigationState,
  decision: AgentDecision,
): void {
  if (decision.reason.trim().length === 0) {
    throw new DecisionValidationError("reason must not be blank");
  }
  const distinguishes = decision.arguments.distinguishes;
  if (new Set(distinguishes).size !== distinguishes.length) {
    throw new DecisionValidationError("distinguishes must not contain duplicates");
  }

  if (decision.tool_name === "request_measurement") {
    const spec = MEASUREMENT_CATALOG[decision.arguments.measurement_type];
    if (spec === undefined) {
      throw new DecisionValidationError(
        `unknown measurement_type: ${pythonQuoted(decision.arguments.measurement_type)}`,
      );
    }
    if (decision.arguments.unit !== spec.unit) {
      throw new DecisionValidationError(
        `${decision.arguments.measurement_type} requires unit ${pythonQuoted(spec.unit)}`,
      );
    }
  }

  if (decision.tool_name === "compare_measurements") {
    const unknown = decision.arguments.measurement_ids.filter(
      (id) => !(id in state.measurements),
    );
    if (unknown.length > 0) {
      throw new DecisionValidationError(
        "comparison references unknown measurements: " +
          pythonList([...unknown].sort()),
      );
    }
    const units = new Set(
      decision.arguments.measurement_ids.map((id) => state.measurements[id]?.unit),
    );
    if (units.size !== 1) {
      throw new DecisionValidationError(
        "measurements with different units cannot be compared",
      );
    }
  }

  if (decision.tool_name === "finish_investigation") {
    const unknown = decision.arguments.evidence.filter(
      (id) => !(id in state.evidence),
    );
    if (unknown.length > 0) {
      throw new DecisionValidationError(
        "conclusion references unknown evidence: " + pythonList([...unknown].sort()),
      );
    }
    validateDiagnosisConfidence(state, decision.arguments);
  }

  if (
    decision.tool_name === "generate_report" &&
    decision.arguments.investigation_id !== state.investigation_id
  ) {
    throw new DecisionValidationError(
      "report investigation_id does not match the current investigation",
    );
  }

  validateSafety(decision);
}

function validateDiagnosisConfidence(
  state: InvestigationState,
  arguments_: Extract<AgentDecision, { tool_name: "finish_investigation" }>["arguments"],
): void {
  if (
    arguments_.outcome !== "diagnosed" ||
    arguments_.confidence <= HIGH_CONFIDENCE_LIMIT
  ) {
    return;
  }
  const cited = arguments_.evidence.map((id) => {
    const evidence = state.evidence[id];
    if (evidence === undefined) {
      throw new DecisionValidationError(
        "conclusion references unknown evidence: " + pythonQuoted(id),
      );
    }
    return evidence;
  });
  if (cited.every((evidence) => evidence.source_type === "image_analysis")) {
    throw new DecisionValidationError(
      "high-confidence diagnosis cannot rely only on image analysis",
    );
  }
  if (!cited.some((evidence) => evidence.source_type === "measurement")) {
    throw new DecisionValidationError(
      "high-confidence diagnosis requires measurement evidence",
    );
  }
}

export function validateSafety(decision: AgentDecision): void {
  const text = normalizedText(decision);
  const operations = [
    "ouvrir",
    "deconnect",
    "debranch",
    "retirer",
    "disconnect",
    "unplug",
    "open",
    "remove",
  ];
  const conductors = [
    "conducteur",
    "cable",
    "connecteur",
    "borne",
    "fil",
    "wire",
    "connector",
    "terminal",
  ];
  const energized = [
    "sous tension",
    "alimente",
    "energized",
    "powered",
    "live conductor",
    "live cable",
    "live wire",
  ];
  if (
    operations.some((term) => text.includes(term)) &&
    conductors.some((term) => text.includes(term)) &&
    energized.some((term) => text.includes(term))
  ) {
    throw new SafetyViolationError(
      "opening or disconnecting an energized conductor is forbidden",
    );
  }
}

function normalizedText(decision: AgentDecision): string {
  const serialized = JSON.stringify({
    reason: decision.reason,
    arguments: argumentsInContractOrder(decision),
  });
  return serialized.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

function argumentsInContractOrder(decision: AgentDecision): Record<string, unknown> {
  const distinguishes = decision.arguments.distinguishes;
  switch (decision.tool_name) {
    case "ask_technician":
      return { distinguishes, question: decision.arguments.question };
    case "request_measurement":
      return {
        distinguishes,
        measurement_type: decision.arguments.measurement_type,
        location: decision.arguments.location,
        unit: decision.arguments.unit,
      };
    case "analyze_image":
      return {
        distinguishes,
        image_id: decision.arguments.image_id,
        focus: decision.arguments.focus,
      };
    case "compare_measurements":
      return {
        distinguishes,
        measurement_ids: decision.arguments.measurement_ids,
        comparison_reason: decision.arguments.comparison_reason,
      };
    case "finish_investigation":
      return {
        distinguishes,
        outcome: decision.arguments.outcome,
        diagnosis: decision.arguments.diagnosis,
        confidence: decision.arguments.confidence,
        evidence: decision.arguments.evidence,
        remaining_uncertainties: decision.arguments.remaining_uncertainties,
      };
    case "generate_report":
      return {
        distinguishes,
        investigation_id: decision.arguments.investigation_id,
      };
  }
}
