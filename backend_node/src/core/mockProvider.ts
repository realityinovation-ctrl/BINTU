/** Scripted provider used by tests. The investigation loop does not call capabilities(). */

import { ScriptExhaustedError } from "./errors";
import type { AgentDecision, InvestigationState } from "./models";
import type { AIProvider, ProviderCapabilities } from "./ports/aiProvider";

export class MockAIProvider implements AIProvider {
  capabilities(): ProviderCapabilities {
    return {
      reasoning_structured: true,
      vision: true,
      asr_streaming: false,
      tts: false,
      native_live: false,
    };
  }

  decideNext(_state: InvestigationState): AgentDecision {
    throw new ScriptExhaustedError("mock decision script is exhausted");
  }
}
