import { ScriptExhaustedError } from "../../src/core/errors";
import { InvestigationEngine } from "../../src/core/engine";
import { normalizeLegacySystem } from "../../src/core/legacySystem";
import {
  dumpState,
  hypothesisImpactSchema,
  parseDecision,
  parseState,
  type AgentDecision,
  type HypothesisImpact,
  type InvestigationState,
} from "../../src/core/models";
import type { AIProvider } from "../../src/core/ports/aiProvider";
import {
  canonical,
  type Fixture,
} from "./fixtures";

class ScriptedProvider implements AIProvider {
  private index = 0;

  constructor(private readonly decisions: AgentDecision[]) {}

  decideNext(_state: InvestigationState): AgentDecision {
    const decision = this.decisions[this.index];
    if (decision === undefined) {
      throw new ScriptExhaustedError("mock decision script is exhausted");
    }
    this.index += 1;
    return structuredClone(decision);
  }
}

class ForbiddenProvider implements AIProvider {
  decideNext(_state: InvestigationState): AgentDecision {
    throw new Error("the provider must not be called");
  }
}

function snapshot(state: InvestigationState) {
  return {
    step_count: state.step_count,
    hypotheses: structuredClone(state.hypotheses),
    evidence: structuredClone(state.evidence),
    timeline: structuredClone(state.timeline),
  };
}

export function replayFixture(fixture: Fixture): void {
  if (fixture.operation === "legacy_installation") {
    const normalized = normalizeLegacySystem(fixture.input_state);
    const state = parseState(normalized);
    if (dumpState(state) === undefined) {
      throw new Error("legacy state did not parse");
    }
    assertEqual(dumpState(state), fixture.expected.state, fixture.id);
    return;
  }
  if (fixture.operation === "sqlite_roundtrip") {
    const state = parseState(fixture.input_state);
    assertEqual(dumpState(state), fixture.expected.state, fixture.id);
    return;
  }

  const state = parseState(fixture.input_state);
  const before = snapshot(state);
  try {
    run(state, fixture);
  } catch (error) {
    const expected = fixture.expected.error;
    if (expected === undefined) {
      throw error;
    }
    if (!(error instanceof Error)) {
      throw error;
    }
    if (error.name !== expected.type || error.message !== expected.message) {
      throw new Error(
        `${fixture.id}: ${error.name}: ${error.message} | expected ${expected.type}: ${expected.message}`,
      );
    }
    assertEqual(snapshot(state), before, `${fixture.id} mutated state`);
    assertEqual(before, fixture.invariants, `${fixture.id} invariants`);
    return;
  }
  if (fixture.expected.error !== undefined) {
    throw new Error(`${fixture.id} should have been refused`);
  }
  assertEqual(dumpState(state), fixture.expected.state, fixture.id);
  if (fixture.invariants !== null) {
    throw new Error(`${fixture.id} success still carries invariants`);
  }
}

function run(state: InvestigationState, fixture: Fixture): void {
  if (fixture.operation === "advance_at_step_limit") {
    new InvestigationEngine(state, new ForbiddenProvider()).advance();
    return;
  }
  if (fixture.operation === "advance_provider_exhausted") {
    new InvestigationEngine(state, new ScriptedProvider([])).advance();
    return;
  }
  const decision =
    fixture.decision === null ? null : parseDecision(fixture.decision);
  if (fixture.operation === "advance") {
    if (decision === null) {
      throw new Error(`${fixture.id} is missing its decision`);
    }
    new InvestigationEngine(state, new ScriptedProvider([decision])).advance();
    return;
  }
  const engine = new InvestigationEngine(state, new ScriptedProvider([]));
  const submission = fixture.submission ?? {};
  if (fixture.operation === "submit_technician_answer") {
    engine.submitTechnicianAnswer(
      String(submission.evidence_id),
      String(submission.answer),
    );
    return;
  }
  if (fixture.operation === "submit_measurement") {
    engine.submitMeasurement(
      String(submission.measurement_id),
      Number(submission.value),
    );
    return;
  }
  if (fixture.operation === "submit_image_analysis") {
    engine.submitImageAnalysis(
      String(submission.evidence_id),
      String(submission.statement),
      Number(submission.certainty),
    );
    return;
  }
  if (fixture.operation === "apply_verification_impacts") {
    const impacts = hypothesisImpactSchema
      .array()
      .parse(submission.impacts) as HypothesisImpact[];
    engine.applyVerificationImpacts(String(submission.verification_id), impacts);
    return;
  }
  throw new Error(`unknown operation ${fixture.operation}`);
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const left = canonical(actual);
  const right = canonical(expected);
  if (left !== right) {
    throw new Error(`${label}\n${diff(left, right)}`);
  }
}

function diff(left: string, right: string): string {
  const a = left ?? "";
  const b = right ?? "";
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) {
    index += 1;
  }
  return `at ${index}\nactual  ${a.slice(Math.max(0, index - 80), index + 160)}\nexpected ${b.slice(Math.max(0, index - 80), index + 160)}`;
}
