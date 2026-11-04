import { describe, expect, it } from "vitest";

import { parseDecision, parseState } from "../../src/core/models";
import { validateDecision } from "../../src/core/validation";
import { loadFixture } from "./fixtures";

const refused = [
  "measurement/unknown_type.json",
  "measurement/wrong_unit.json",
  "safety/energized_conductor.json",
  "conclusion/high_confidence_without_measurement.json",
  "conclusion/image_only_high_confidence.json",
  "conclusion/refused_conclusion_unchanged.json",
] as const;

const accepted = [
  "conclusion/confidence_at_limit_without_measurement.json",
  "conclusion/valid_conclusion.json",
] as const;

describe("decision validation fixtures", () => {
  for (const relative of refused) {
    it(relative, () => {
      const fixture = loadFixture(relative);
      const error = fixture.expected.error;
      expect(error).toBeDefined();
      expect(() =>
        validateDecision(parseState(fixture.input_state), parseDecision(fixture.decision)),
      ).toThrowError(
        expect.objectContaining({ name: error?.type, message: error?.message }),
      );
    });
  }

  for (const relative of accepted) {
    it(relative, () => {
      const fixture = loadFixture(relative);
      expect(() =>
        validateDecision(parseState(fixture.input_state), parseDecision(fixture.decision)),
      ).not.toThrow();
    });
  }
});
