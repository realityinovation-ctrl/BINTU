import type { InvestigationState } from "../models";

/**
 * Persistence boundary. The core does not choose SQL, files, or transactions.
 * A later phase supplies the implementation.
 */
export interface DiagnosticRepository {
  get(investigationId: string): InvestigationState;
  save(state: InvestigationState): void;
}
