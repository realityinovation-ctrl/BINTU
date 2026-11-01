import type { FastifyRequest } from "fastify";

import { CSRF_FAILED, type AuthRuntime } from "../auth/runtime";
import { digestsEqual, sha256Hex } from "../auth/secrets";
import { sessionIsActive } from "../auth/sessions";
import { readCookie } from "./cookies";
import { HttpError } from "./errors";
import { headerText, originAllowed } from "./origin";

const PUBLIC_POSTS = new Set(["/auth/login", "/auth/register"]);

/**
 * Non-GET routes check Origin. Login and register stop there.
 * Every other mutation needs the session's CSRF token.
 * A missing or dead session stays a 401, before the CSRF result.
 */
export function assertMutationGuards(
  request: FastifyRequest,
  runtime: AuthRuntime,
): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return;
  }
  if (!originAllowed(headerText(request.headers.origin), runtime.allowedOrigins)) {
    throw new HttpError(403, "Origin is not allowed");
  }
  const path = request.url.split("?")[0] ?? request.url;
  if (PUBLIC_POSTS.has(path)) {
    return;
  }
  const presented = headerText(request.headers["x-csrf-token"]);
  const sessionToken = readCookie(
    headerText(request.headers.cookie),
    runtime.cookieName,
  );
  if (sessionToken === undefined) {
    throw new HttpError(401, "Authentication required");
  }
  const session = runtime.store.findSession(sha256Hex(sessionToken));
  if (
    session === null ||
    !sessionIsActive(session, runtime.clock.now(), runtime.idleMs)
  ) {
    throw new HttpError(401, "Authentication required");
  }
  if (
    presented === undefined ||
    session.csrfTokenHash == null ||
    !digestsEqual(sha256Hex(presented), session.csrfTokenHash)
  ) {
    throw new HttpError(403, CSRF_FAILED);
  }
}
