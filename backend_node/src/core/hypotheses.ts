/** The core alone derives a hypothesis status. The model only proposes one. */

import { DecisionValidationError } from "./errors";
import type {
  AgentDecision,
  HypothesisImpact,
  HypothesisStatus,
  InvestigationState,
} from "./models";
import { pythonList } from "./pythonFormat";

export function deriveHypothesisStatus(
  current: HypothesisStatus,
  impact: HypothesisImpact,
): HypothesisStatus {
  if (current === "eliminated") {
    return current;
  }
  if (impact.relation === "supporting") {
    if (impact.strength === "strong") {
      return "supported";
    }
    if (current === "supported") {
      return current;
    }
    return "plausible";
  }
  if (impact.strength === "strong") {
    return "eliminated";
  }
  return "weakened";
}

export function validateHypothesisUpdates(
  state: InvestigationState,
  decision: AgentDecision,
): void {
  const updates = decision.hypothesis_updates;
  const hypothesisIds = updates.map((update) => update.hypothesis_id);
  if (new Set(hypothesisIds).size !== hypothesisIds.length) {
    throw new DecisionValidationError(
      "a decision cannot update the same hypothesis twice",
    );
  }
  const allowed = new Set(decision.arguments.distinguishes);
  for (const update of updates) {
    if (!allowed.has(update.hypothesis_id)) {
      throw new DecisionValidationError(
        "hypothesis update is outside distinguishes: " +
          update.hypothesis_id,
      );
    }
    if (update.evidence_ids.length === 0) {
      throw new DecisionValidationError("hypothesis update requires evidence_ids");
    }
    const unknown = update.evidence_ids.filter((id) => !(id in state.evidence));
    if (unknown.length > 0) {
      throw new DecisionValidationError(
        "hypothesis update references unknown evidence: " +
          pythonList([...unknown].sort()),
      );
    }
    if (
      update.status === "eliminated" &&
      (update.relation !== "contradictory" || update.strength !== "strong")
    ) {
      throw new DecisionValidationError(
        "hypothesis elimination requires strong contradictory evidence",
      );
    }
    const derived = deriveHypothesisStatus(
      state.hypotheses[update.hypothesis_id].status,
      {
        hypothesis_id: update.hypothesis_id,
        relation: update.relation,
        strength: update.strength,
      },
    );
    if (update.status !== derived) {
      throw new DecisionValidationError(
        "proposed hypothesis status does not match core derivation: " +
          `${update.hypothesis_id} -> ${derived}`,
      );
    }
  }
}
