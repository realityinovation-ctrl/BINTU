import { describe, expect, it } from "vitest";

import { DEFERRED_HTTP_FIXTURES, listFixtures, loadFixture } from "./fixtures";
import { replayFixture } from "./replay";

const deferred = new Set<string>(DEFERRED_HTTP_FIXTURES);
const fixtures = listFixtures();

describe("python parity", () => {
  it("names every http fixture deferred until the route phase", () => {
    expect(DEFERRED_HTTP_FIXTURES).toEqual(["measurement/non_finite_value.json"]);
    for (const relative of DEFERRED_HTTP_FIXTURES) {
      expect(fixtures).toContain(relative);
    }
  });

  for (const relative of fixtures) {
    if (deferred.has(relative)) {
      continue;
    }
    it(relative, () => {
      replayFixture(loadFixture(relative));
    });
  }
});
