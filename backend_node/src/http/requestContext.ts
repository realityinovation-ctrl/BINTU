import { AsyncLocalStorage } from "node:async_hooks";

import type { FastifyRequest } from "fastify";

export const httpRequestContext = new AsyncLocalStorage<FastifyRequest>();

export function currentHttpRequest(): FastifyRequest | undefined {
  return httpRequestContext.getStore();
}
