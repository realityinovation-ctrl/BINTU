import { MEASUREMENT_CATALOG } from "../core/measurementCatalog";
import type { InvestigationState, PendingAction } from "../core/models";

/** The public investigation document. Empty hypothesis proposals stay omitted. */
export function presentInvestigation(state: InvestigationState): {
  investigation_id: string;
  status: string;
  state: Record<string, unknown>;
} {
  return {
    investigation_id: state.investigation_id,
    status: state.status,
    state: {
      problem: state.problem,
      system: state.system,
      measurement_catalog: Object.values(MEASUREMENT_CATALOG).map((spec) => ({
        measurement_type: spec.measurement_type,
        label: spec.label,
        unit: spec.unit,
      })),
      observations: Object.values(state.observations),
      measurements: Object.values(state.measurements).map((measurement) => ({
        ...measurement,
        source_type: "measurement",
      })),
      hypotheses: Object.values(state.hypotheses),
      evidence: Object.values(state.evidence),
      pending_action: presentPending(state.pending_action),
      conclusion: state.conclusion,
      timeline: state.timeline,
    },
  };
}

function presentPending(pending: PendingAction | null): Record<string, unknown> | null {
  if (pending === null) {
    return null;
  }
  const decision = structuredClone(pending.decision);
  const updates = decision.hypothesis_updates;
  const payload: Record<string, unknown> = {
    action_id: pending.action_id,
    tool_name: decision.tool_name,
    arguments: decision.arguments,
    reason: decision.reason,
  };
  if (updates.length > 0) {
    payload.hypothesis_updates = updates;
  }
  return payload;
}
