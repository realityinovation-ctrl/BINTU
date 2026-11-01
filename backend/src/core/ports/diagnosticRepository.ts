import type { InvestigationState } from "../models";

/**
 * Persistence boundary. The core does not choose a database, files, or transactions.
 */
export interface InvestigationSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
}

export interface DiagnosticRepository {
  create(organizationId: string, createdByUserId: string): InvestigationState;
  get(investigationId: string, organizationId: string): InvestigationState;
  list(organizationId: string, limit?: number): InvestigationSummary[];
  save(state: InvestigationState, organizationId: string): void;
  delete(investigationId: string, organizationId: string): void;
}
