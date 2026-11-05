import { describe, expect, it } from "vitest";

import { MockAIProvider } from "../../src/core/mockProvider";

describe("provider capabilities", () => {
  it("declares structured reasoning and vision on the mock", () => {
    expect(new MockAIProvider().capabilities()).toEqual({
      reasoning_structured: true,
      vision: true,
      asr_streaming: false,
      tts: false,
      native_live: false,
    });
  });
});
