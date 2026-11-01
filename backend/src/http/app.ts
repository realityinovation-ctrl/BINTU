import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";

import type { HttpDependencies } from "./deps";
import { mapError } from "./errors";
import { parseRelaxedJson } from "./jsonBody";
import { registerReadRoutes } from "./readRoutes";
import { sendJson } from "./reply";

export type { HttpDependencies } from "./deps";

export async function buildApp(deps: HttpDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_request, body, done) => {
      try {
        const text = typeof body === "string" ? body : body.toString("utf8");
        done(null, parseRelaxedJson(text));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );
  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: 32 * 1024 * 1024 + 2,
    },
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    const current = reply.getHeader("content-type");
    if (typeof current === "string" && current.startsWith("application/json")) {
      reply.header("content-type", "application/json");
    }
    return payload;
  });
  app.setErrorHandler((error, _request, reply) => {
    const mapped = mapError(error);
    return sendJson(reply, mapped.status, mapped.body);
  });
  registerReadRoutes(app, deps);
  await app.ready();
  return app;
}
