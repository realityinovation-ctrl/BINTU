import type { AgentDecision, InvestigationState } from "../models";

/** What a provider can do. The investigation loop does not read this yet. */
export interface ProviderCapabilities {
  reasoning_structured: boolean;
  vision: boolean;
  asr_streaming: boolean;
  tts: boolean;
  native_live: boolean;
}

/** One provider-neutral decision for the current state. Implementations live outside core. */
export interface AIProvider {
  decideNext(state: InvestigationState): AgentDecision;
  capabilities(): ProviderCapabilities;
}
