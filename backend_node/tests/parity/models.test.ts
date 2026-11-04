import { describe, expect, it } from "vitest";

import { normalizeLegacySystem } from "../../src/core/legacySystem";
import { dumpState, parseState } from "../../src/core/models";
import { canonical, loadFixture } from "./fixtures";

describe("diagnostic system fixtures", () => {
  it("reads a legacy installation and drops null characteristics", () => {
    const fixture = loadFixture("persistence/legacy_installation.json");
    const state = parseState(normalizeLegacySystem(fixture.input_state));
    expect(canonical(dumpState(state))).toBe(canonical(fixture.expected.state));
    expect(state.system.characteristics).toEqual({
      battery_present: false,
      panel_count: 12,
    });
    expect(state.system.characteristics).not.toHaveProperty("inverter_model");
  });

  it("keeps an electric motor through a model round trip", () => {
    const fixture = loadFixture("persistence/electric_motor.json");
    const state = parseState(fixture.input_state);
    expect(canonical(dumpState(state))).toBe(canonical(fixture.expected.state));
    expect(state.system.type).toBe("electric_motor");
    expect(state.system.characteristics).toEqual({ rated_power_kw: 4 });
  });
});
