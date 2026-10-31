import type { AgentDecision, InvestigationState } from "../models";

/** One provider-neutral decision for the current state. Implementations live outside core. */
export interface AIProvider {
  decideNext(state: InvestigationState): AgentDecision;
}
