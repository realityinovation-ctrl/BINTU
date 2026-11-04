import { describe, expect, test } from "vitest";
import { entityLabel, memoryBackendLabel } from "./assistantLabels";

describe("assistantLabels", () => {
  test("traduit les clés d'entités connues", () => {
    expect(entityLabel("city")).toBe("Ville");
    expect(entityLabel("site_location")).toBe("Site");
    expect(entityLabel("custom_key")).toBe("custom key");
  });

  test("étiquette le backend mémoire", () => {
    expect(memoryBackendLabel("local")).toBe("Mémoire locale");
    expect(memoryBackendLabel("mem0")).toBe("Mem0");
    expect(memoryBackendLabel("off")).toBe("Mémoire désactivée");
  });
});
