import { describe, expect, it } from "vitest";

import { assertDecisionIsNotRepetitive } from "../../src/core/antiLoop";
import { parseDecision, parseState } from "../../src/core/models";
import { loadFixture } from "./fixtures";

const repeated = [
  "anti_loop/repeated_question.json",
  "anti_loop/repeated_measurement.json",
  "anti_loop/repeated_image_focus.json",
  "anti_loop/repeated_comparison.json",
] as const;

describe("anti-loop fixtures", () => {
  for (const relative of repeated) {
    it(relative, () => {
      const fixture = loadFixture(relative);
      const state = parseState(fixture.input_state);
      const error = fixture.expected.error;
      expect(() =>
        assertDecisionIsNotRepetitive(state, parseDecision(fixture.decision)),
      ).toThrowError(
        expect.objectContaining({ name: error?.type, message: error?.message }),
      );
      expect(state.step_count).toBe(fixture.invariants?.step_count);
      expect(state.timeline).toEqual(fixture.invariants?.timeline);
    });
  }

  it("never treats a conclusion as a repetition", () => {
    const fixture = loadFixture("anti_loop/finish_is_not_repetitive.json");
    expect(() =>
      assertDecisionIsNotRepetitive(
        parseState(fixture.input_state),
        parseDecision(fixture.decision),
      ),
    ).not.toThrow();
  });
});
