import type { FastifyInstance } from "fastify";

import { InvestigationNotFoundError } from "../core/errors";
import { requirePermission } from "./auth";
import type { HttpDependencies } from "./deps";
import { sendJson } from "./reply";
import { presentInvestigation } from "./present";

export function registerReadRoutes(
  app: FastifyInstance,
  deps: HttpDependencies,
): void {
  app.get("/api/health", async (_request, reply) => {
    return sendJson(reply, 200, { status: "ok" });
  });

  app.get("/api/investigations", async (_request, reply) => {
    const context = requirePermission(deps.auth, "diagnostic:read");
    const summaries = [];
    for (const item of deps.repository.list(context.organizationId, 20)) {
      try {
        const state = deps.repository.get(item.id, context.organizationId);
        summaries.push({
          investigation_id: item.id,
          status: item.status,
          updated_at: item.updatedAt,
          problem: state.problem === null ? null : state.problem.description,
        });
      } catch (error) {
        if (error instanceof InvestigationNotFoundError) {
          continue;
        }
        throw error;
      }
    }
    return sendJson(reply, 200, summaries);
  });

  app.get<{ Params: { investigation_id: string } }>(
    "/api/investigations/:investigation_id",
    async (request, reply) => {
      const context = requirePermission(deps.auth, "diagnostic:read");
      const state = deps.repository.get(
        request.params.investigation_id,
        context.organizationId,
      );
      return sendJson(reply, 200, presentInvestigation(state));
    },
  );
}
