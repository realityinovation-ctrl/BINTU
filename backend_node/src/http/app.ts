import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";

import { registerAuthRoutes } from "./authRoutes";
import { assertMutationGuards } from "./csrf";
import type { HttpDependencies } from "./deps";
import { mapError } from "./errors";
import { parseRelaxedJson } from "./jsonBody";
import { registerOperateRoutes } from "./operateRoutes";
import { registerReadRoutes } from "./readRoutes";
import { redactStructured, redactText } from "./redact";
import { sendJson } from "./reply";
import { httpRequestContext } from "./requestContext";
import { SessionAuthenticator } from "./sessionAuth";

export type { HttpDependencies } from "./deps";

export async function buildApp(deps: HttpDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: false });
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
  app.addHook("onRequest", (request, _reply, done) => {
    httpRequestContext.enterWith(request);
    done();
  });
  if (deps.logStream !== undefined) {
    const stream = deps.logStream;
    app.addHook("preHandler", async (request) => {
      stream.write(
        `${redactText(
          JSON.stringify({
            body: redactStructured(request.body),
            headers: redactStructured(request.headers),
          }),
        )}\n`,
      );
    });
  }
  if (
    deps.authRuntime !== undefined &&
    deps.auth instanceof SessionAuthenticator
  ) {
    const runtime = deps.authRuntime;
    app.addHook("preHandler", async (request) => {
      assertMutationGuards(request, runtime);
    });
  }
  app.addHook("onSend", async (_request, reply, payload) => {
    if (deps.logStream !== undefined) {
      deps.logStream.write(`${exchangeLog(reply, payload)}\n`);
    }
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
  if (deps.authRuntime !== undefined) {
    registerAuthRoutes(app, deps.authRuntime, deps);
  }
  registerReadRoutes(app, deps);
  registerOperateRoutes(app, deps);
  await app.ready();
  return app;
}

function exchangeLog(reply: FastifyReply, payload: unknown): string {
  let body: unknown = payload;
  if (typeof payload === "string") {
    try {
      body = JSON.parse(payload) as unknown;
    } catch {
      body = payload;
    }
  }
  return redactText(
    JSON.stringify(
      redactStructured({
        "set-cookie": reply.getHeader("set-cookie"),
        body,
      }),
    ),
  );
}
