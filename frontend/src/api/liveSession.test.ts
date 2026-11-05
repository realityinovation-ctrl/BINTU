import { describe, expect, test } from "vitest";
import { buildLiveWebSocketUrl } from "./liveSession";

describe("buildLiveWebSocketUrl", () => {
  test("ajoute le jeton Bearer en query pour le mobile et le desk", () => {
    const url = buildLiveWebSocketUrl("abc.token-value");
    expect(url).toContain("/api/live");
    expect(url).toContain("token=abc.token-value");
    expect(url.startsWith("ws")).toBe(true);
  });

  test("reste utilisable sans jeton (atelier local)", () => {
    const url = buildLiveWebSocketUrl(null);
    expect(url).toContain("/api/live");
    expect(url).not.toContain("token=");
  });
});
