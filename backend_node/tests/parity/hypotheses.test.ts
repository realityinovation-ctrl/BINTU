import { describe, expect, it } from "vitest";

import { deriveHypothesisStatus } from "../../src/core/hypotheses";
import { parseDecision, parseState } from "../../src/core/models";
import { validateDecision } from "../../src/core/validation";
import { loadFixture } from "./fixtures";

describe("hypothesis fixtures", () => {
  it("rejects a status copied from the model", () => {
    const fixture = loadFixture("hypothesis/status_derived_by_core.json");
    const error = fixture.expected.error;
    expect(() =>
      validateDecision(parseState(fixture.input_state), parseDecision(fixture.decision)),
    ).toThrowError(
      expect.objectContaining({ name: error?.type, message: error?.message }),
    );
  });

  it("rejects elimination without strong contradictory evidence", () => {
    const fixture = loadFixture(
      "hypothesis/elimination_without_strong_contradiction.json",
    );
    const error = fixture.expected.error;
    expect(() =>
      validateDecision(parseState(fixture.input_state), parseDecision(fixture.decision)),
    ).toThrowError(
      expect.objectContaining({ name: error?.type, message: error?.message }),
    );
  });

  it("keeps an eliminated hypothesis eliminated", () => {
    expect(
      deriveHypothesisStatus("eliminated", {
        hypothesis_id: "H1",
        relation: "contradictory",
        strength: "strong",
      }),
    ).toBe("eliminated");
    const fixture = loadFixture(
      "hypothesis/eliminated_hypothesis_stays_eliminated.json",
    );
    expect(() =>
      validateDecision(parseState(fixture.input_state), parseDecision(fixture.decision)),
    ).not.toThrow();
  });
});
