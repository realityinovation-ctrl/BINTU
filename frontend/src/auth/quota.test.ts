import { describe, expect, test } from "vitest";
import { formatQuotaLine } from "./quota";

describe("formatQuotaLine", () => {
  test("affiche used/limit", () => {
    expect(formatQuotaLine(3, 40, "auj.")).toBe("3/40 auj.");
  });
});
