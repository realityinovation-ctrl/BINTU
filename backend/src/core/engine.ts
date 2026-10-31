/** In-memory investigation loop. The provider is consulted, never trusted. */

import { assertDecisionIsNotRepetitive, actionSignature } from "./antiLoop";
import {
  DecisionValidationError,
  InvalidStateTransitionError,
  UnsupportedToolError,
} from "./errors";
import { deriveHypothesisStatus } from "./hypotheses";
import type {
  AgentDecision,
  AnalyzeImageArguments,
  CompareMeasurementsArguments,
  Evidence,
  FinishInvestigationArguments,
  HypothesisId,
  HypothesisImpact,
  InvestigationState,
  InvestigationStatus,
  Observation,
  PendingAction,
  RequestMeasurementArguments,
  TimelineEventType,
  Verification,
} from "./models";
import type { AIProvider } from "./ports/aiProvider";
import { validateDecision } from "./validation";

const TRANSITIONS: Record<InvestigationStatus, ReadonlySet<InvestigationStatus>> = {
  investigating: new Set([
    "waiting_for_technician",
    "completed",
    "insufficient_information",
  ]),
  waiting_for_technician: new Set(["investigating"]),
  completed: new Set(),
  insufficient_information: new Set(),
};

export class InvestigationEngine {
  constructor(
    readonly state: InvestigationState,
    readonly provider: AIProvider,
  ) {}

  advance(): InvestigationState {
    if (this.state.status !== "investigating") {
      throw new InvalidStateTransitionError(
        `cannot advance from ${this.state.status}`,
      );
    }
    if (this.state.step_count >= this.state.max_steps) {
      this.finishInsufficient("Nombre maximal d'étapes atteint.");
      return this.state;
    }

    const decision = this.provider.decideNext(structuredClone(this.state));
    validateDecision(this.state, decision);
    assertDecisionIsNotRepetitive(this.state, decision);
    if (decision.tool_name === "generate_report") {
      throw new UnsupportedToolError(
        "generate_report is contracted but deferred in Agent Core v0.2",
      );
    }
    this.state.step_count += 1;
    const actionId = `action-${this.state.step_count}`;
    const details: Record<string, unknown> = {
      action_id: actionId,
      tool_name: decision.tool_name,
      distinguishes: [...decision.arguments.distinguishes],
      evidence_ids: Object.keys(this.state.evidence).sort(),
    };
    const signature = actionSignature(decision);
    if (signature !== null) {
      details.signature = signature;
    }
    this.event("decision_recorded", decision.reason, details);
    this.applyHypothesisUpdates(actionId, decision);
    this.dispatch(actionId, decision);
    return this.state;
  }

  submitTechnicianAnswer(
    evidenceId: string,
    answer: string,
    impacts: HypothesisImpact[] = [],
  ): InvestigationState {
    const pending = this.requirePending("ask_technician", "AskTechnicianArguments");
    if (answer.trim().length === 0) {
      throw new DecisionValidationError("technician answer must not be blank");
    }
    const observation: Observation = {
      id: `observation:${evidenceId}`,
      source_type: "technician_answer",
      source_id: pending.action_id,
      statement: answer,
      value: null,
      unit: null,
      certainty: null,
    };
    this.recordToolResult(pending, evidenceId, observation, impacts);
    this.resume(pending.action_id);
    return this.state;
  }

  submitMeasurement(
    measurementId: string,
    value: number,
    impacts: HypothesisImpact[] = [],
  ): InvestigationState {
    const pending = this.requirePending(
      "request_measurement",
      "RequestMeasurementArguments",
    );
    const arguments_ = pending.decision.arguments as RequestMeasurementArguments;
    if (measurementId in this.state.measurements) {
      throw new DecisionValidationError(
        `measurement already exists: ${measurementId}`,
      );
    }
    const observation: Observation = {
      id: `observation:${measurementId}`,
      source_type: "measurement",
      source_id: measurementId,
      statement: `${arguments_.measurement_type} mesurée à ${arguments_.location}`,
      value,
      unit: arguments_.unit,
      certainty: null,
    };
    this.recordToolResult(pending, measurementId, observation, impacts);
    this.state.measurements[measurementId] = {
      id: measurementId,
      measurement_type: arguments_.measurement_type,
      location: arguments_.location,
      value,
      unit: arguments_.unit,
      source_id: pending.action_id,
    };
    this.resume(pending.action_id);
    return this.state;
  }

  submitImageAnalysis(
    evidenceId: string,
    statement: string,
    certainty: number,
    impacts: HypothesisImpact[] = [],
  ): InvestigationState {
    const pending = this.requirePending("analyze_image", "AnalyzeImageArguments");
    const arguments_ = pending.decision.arguments as AnalyzeImageArguments;
    const observation: Observation = {
      id: `observation:${evidenceId}`,
      source_type: "image_analysis",
      source_id: arguments_.image_id,
      statement,
      value: null,
      unit: null,
      certainty,
    };
    this.recordToolResult(pending, evidenceId, observation, impacts);
    this.resume(pending.action_id);
    return this.state;
  }

  applyVerificationImpacts(
    verificationId: string,
    impacts: HypothesisImpact[],
  ): InvestigationState {
    if (this.state.status !== "investigating") {
      throw new InvalidStateTransitionError(
        "verification impacts require an active investigation",
      );
    }
    if (impacts.length === 0) {
      throw new DecisionValidationError("at least one impact is required");
    }
    const verification = this.state.verifications[verificationId];
    if (verification === undefined) {
      throw new DecisionValidationError(`unknown verification: ${verificationId}`);
    }
    if (verification.impacts.length > 0) {
      throw new DecisionValidationError(
        `verification impacts already applied: ${verificationId}`,
      );
    }
    const unknownEvidence = verification.evidence_ids.filter(
      (id) => !(id in this.state.evidence),
    );
    if (unknownEvidence.length > 0) {
      throw new DecisionValidationError(
        "verification references unknown evidence: " +
          pythonList(unknownEvidence),
      );
    }
    const unknownObservations = verification.observation_ids.filter(
      (id) => !(id in this.state.observations),
    );
    if (unknownObservations.length > 0) {
      throw new DecisionValidationError(
        "verification references unknown observations: " +
          pythonList(unknownObservations),
      );
    }
    this.validateImpacts(verification.distinguishes, impacts);
    const updated = structuredClone(verification);
    updated.impacts = [...impacts];
    this.state.verifications[verificationId] = updated;
    this.event(
      "verification_recorded",
      "Impacts de vérification validés par le cœur.",
      {
        verification_id: verificationId,
        hypothesis_ids: impacts.map((impact) => impact.hypothesis_id),
      },
    );
    this.applyImpacts(updated);
    return this.state;
  }

  private dispatch(actionId: string, decision: AgentDecision): void {
    if (
      decision.tool_name === "ask_technician" ||
      decision.tool_name === "request_measurement" ||
      decision.tool_name === "analyze_image"
    ) {
      this.state.pending_action = { action_id: actionId, decision };
      this.event(
        "action_requested",
        `Action externe demandée : ${decision.tool_name}.`,
        { action_id: actionId },
      );
      this.setStatus("waiting_for_technician");
      return;
    }
    if (decision.tool_name === "compare_measurements") {
      this.compareMeasurements(actionId, decision, decision.arguments);
      return;
    }
    if (decision.tool_name === "finish_investigation") {
      this.finish(decision.arguments);
      return;
    }
    throw new UnsupportedToolError(`unsupported tool: ${decision.tool_name}`);
  }

  private compareMeasurements(
    actionId: string,
    decision: AgentDecision,
    arguments_: CompareMeasurementsArguments,
  ): void {
    const measurements = arguments_.measurement_ids.map((id) => {
      const measurement = this.state.measurements[id];
      if (measurement === undefined) {
        throw new DecisionValidationError(
          `comparison references unknown measurements: ['${id}']`,
        );
      }
      return measurement;
    });
    const values = measurements.map((measurement) => measurement.value);
    const first = measurements[0];
    if (first === undefined) {
      throw new DecisionValidationError(
        "comparison references unknown measurements: []",
      );
    }
    const evidenceId = `comparison-${this.state.step_count}`;
    const rendered = measurements
      .map((measurement) => `${measurement.id}=${formatGeneral(measurement.value)} ${measurement.unit}`)
      .join("; ");
    const observation: Observation = {
      id: `observation:${evidenceId}`,
      source_type: "observation",
      source_id: actionId,
      statement: `Comparaison factuelle : ${rendered}`,
      value: Math.max(...values) - Math.min(...values),
      unit: first.unit,
      certainty: null,
    };
    this.recordToolResult(
      { action_id: actionId, decision },
      evidenceId,
      observation,
      [],
    );
  }

  private finish(arguments_: FinishInvestigationArguments): void {
    if (arguments_.outcome === "insufficient_information") {
      this.finishInsufficient(
        "Informations insuffisantes pour établir un diagnostic fiable.",
      );
      return;
    }
    if (arguments_.diagnosis === null) {
      throw new DecisionValidationError("a diagnosed outcome requires a diagnosis");
    }
    this.state.conclusion = {
      diagnosis: arguments_.diagnosis,
      confidence: arguments_.confidence,
      evidence_ids: [...arguments_.evidence],
      remaining_uncertainties: [...arguments_.remaining_uncertainties],
    };
    this.setStatus("completed");
  }

  private finishInsufficient(summary: string): void {
    this.state.conclusion = null;
    this.setStatus("insufficient_information", summary);
  }

  private requirePending(
    toolName: "ask_technician" | "request_measurement" | "analyze_image",
    argumentName: string,
  ): PendingAction {
    if (this.state.status !== "waiting_for_technician") {
      throw new InvalidStateTransitionError(
        "no technician response is currently expected",
      );
    }
    const pending = this.state.pending_action;
    if (pending === null || pending.decision.tool_name !== toolName) {
      throw new InvalidStateTransitionError(
        `pending action does not accept ${argumentName}`,
      );
    }
    return pending;
  }

  private resume(actionId: string): void {
    this.state.pending_action = null;
    this.event(
      "action_resumed",
      "Résultat externe reçu ; l'investigation peut reprendre.",
      { action_id: actionId },
    );
    this.setStatus("investigating");
  }

  private recordToolResult(
    action: PendingAction,
    evidenceId: string,
    observation: Observation,
    impacts: HypothesisImpact[],
  ): void {
    const verificationId = `verification:${action.action_id}`;
    if (observation.id in this.state.observations) {
      throw new DecisionValidationError(
        `observation already exists: ${observation.id}`,
      );
    }
    if (evidenceId in this.state.evidence) {
      throw new DecisionValidationError(`evidence already exists: ${evidenceId}`);
    }
    if (verificationId in this.state.verifications) {
      throw new DecisionValidationError(
        `verification already exists: ${verificationId}`,
      );
    }
    const evidence: Evidence = {
      id: evidenceId,
      observation_id: observation.id,
      source_type: observation.source_type,
      source_id: observation.source_id,
      certainty: observation.certainty,
    };
    const verification: Verification = {
      id: verificationId,
      action_id: action.action_id,
      distinguishes: [...action.decision.arguments.distinguishes],
      observation_ids: [observation.id],
      evidence_ids: [evidence.id],
      impacts: [...impacts],
    };
    this.validateImpacts(verification.distinguishes, impacts);
    this.state.observations[observation.id] = observation;
    this.state.evidence[evidence.id] = evidence;
    this.state.verifications[verification.id] = verification;
    this.event(
      "observation_added",
      `Observation ajoutée depuis ${observation.source_type}.`,
      {
        observation_id: observation.id,
        source_type: observation.source_type,
        source_id: observation.source_id,
      },
    );
    this.event(
      "evidence_added",
      "Preuve créée par référence à une observation validée.",
      {
        evidence_id: evidence.id,
        observation_id: evidence.observation_id,
        source_type: evidence.source_type,
        source_id: evidence.source_id,
      },
    );
    this.event(
      "verification_recorded",
      "Résultat d'outil validé et enregistré.",
      {
        verification_id: verification.id,
        action_id: verification.action_id,
        evidence_ids: [...verification.evidence_ids],
      },
    );
    this.applyImpacts(verification);
  }

  private applyHypothesisUpdates(actionId: string, decision: AgentDecision): void {
    for (const update of decision.hypothesis_updates) {
      const verificationId = `hypothesis-update:${actionId}:${update.hypothesis_id}`;
      const observationIds = update.evidence_ids.map((evidenceId) => {
        const evidence = this.state.evidence[evidenceId];
        if (evidence === undefined) {
          throw new DecisionValidationError(
            `hypothesis update references unknown evidence: ['${evidenceId}']`,
          );
        }
        return evidence.observation_id;
      });
      const verification: Verification = {
        id: verificationId,
        action_id: actionId,
        distinguishes: [update.hypothesis_id],
        observation_ids: observationIds,
        evidence_ids: [...update.evidence_ids],
        impacts: [
          {
            hypothesis_id: update.hypothesis_id,
            relation: update.relation,
            strength: update.strength,
          },
        ],
      };
      this.state.verifications[verification.id] = verification;
      this.applyImpacts(verification);
    }
  }

  private validateImpacts(
    distinguishes: readonly HypothesisId[],
    impacts: readonly HypothesisImpact[],
  ): void {
    const hypothesisIds = impacts.map((impact) => impact.hypothesis_id);
    if (new Set(hypothesisIds).size !== hypothesisIds.length) {
      throw new DecisionValidationError(
        "a verification cannot impact the same hypothesis twice",
      );
    }
    const allowed = new Set(distinguishes);
    const invalid = hypothesisIds.filter((id) => !allowed.has(id));
    if (invalid.length > 0) {
      throw new DecisionValidationError(
        "verification impacts hypotheses not listed in distinguishes: " +
          pythonList([...invalid].sort()),
      );
    }
  }

  private applyImpacts(verification: Verification): void {
    for (const impact of verification.impacts) {
      const hypothesis = this.state.hypotheses[impact.hypothesis_id];
      const previous = hypothesis.status;
      const target =
        impact.relation === "supporting"
          ? hypothesis.supporting_evidence_ids
          : hypothesis.contradictory_evidence_ids;
      for (const evidenceId of verification.evidence_ids) {
        if (!target.includes(evidenceId)) {
          target.push(evidenceId);
        }
      }
      hypothesis.status = deriveHypothesisStatus(previous, impact);
      if (previous !== hypothesis.status) {
        this.event(
          "hypothesis_changed",
          `${impact.hypothesis_id}: ${previous} -> ${hypothesis.status}.`,
          {
            hypothesis_id: impact.hypothesis_id,
            from: previous,
            to: hypothesis.status,
            verification_id: verification.id,
            evidence_ids: [...verification.evidence_ids],
          },
        );
      }
    }
  }

  private setStatus(newStatus: InvestigationStatus, summary?: string): void {
    const oldStatus = this.state.status;
    if (!TRANSITIONS[oldStatus].has(newStatus)) {
      throw new InvalidStateTransitionError(
        `invalid status transition: ${oldStatus} -> ${newStatus}`,
      );
    }
    this.state.status = newStatus;
    this.event(
      "status_changed",
      summary ?? `Statut : ${oldStatus} -> ${newStatus}.`,
      { from: oldStatus, to: newStatus },
    );
  }

  private event(
    eventType: TimelineEventType,
    summary: string,
    details: Record<string, unknown> = {},
  ): void {
    this.state.timeline.push({
      sequence: this.state.timeline.length + 1,
      event_type: eventType,
      summary,
      details,
    });
  }
}

function pythonList(values: readonly string[]): string {
  return `[${[...values].sort().map((value) => `'${value}'`).join(", ")}]`;
}

function formatGeneral(value: number): string {
  if (Object.is(value, -0)) {
    return "-0";
  }
  return String(value);
}
