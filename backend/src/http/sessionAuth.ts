import { permissionsFor } from "../auth/permissions";
import type { AuthRuntime } from "../auth/runtime";
import { sha256Hex } from "../auth/secrets";
import { sessionIsActive } from "../auth/sessions";
import { AuthenticationError } from "./errors";
import type { AuthContext, AuthContextProvider } from "./ports";
import { readCookie } from "./cookies";
import { headerText } from "./origin";
import { currentHttpRequest } from "./requestContext";

/** Session cookie to AuthContext. The request body never supplies identity. */
export class SessionAuthenticator implements AuthContextProvider {
  constructor(private readonly runtime: AuthRuntime) {}

  authenticate(): AuthContext {
    const request = currentHttpRequest();
    const token =
      request === undefined
        ? undefined
        : readCookie(headerText(request.headers.cookie), this.runtime.cookieName);
    if (token === undefined) {
      throw new AuthenticationError("unauthenticated");
    }
    const session = this.runtime.store.findSession(sha256Hex(token));
    const now = this.runtime.clock.now();
    if (session === null || !sessionIsActive(session, now, this.runtime.idleMs)) {
      throw new AuthenticationError("unauthenticated");
    }
    const user = this.runtime.store.findUserById(session.userId);
    if (user === null || user.disabledAt !== null) {
      throw new AuthenticationError("unauthenticated");
    }
    this.runtime.store.touchSession(session.idHash, now.toISOString());
    const membership = this.runtime.store
      .listMemberships(user.id)
      .find((item) => item.organizationId === session.organizationId);
    if (membership === undefined) {
      return {
        userId: user.id,
        organizationId: null,
        role: null,
        permissions: [],
      };
    }
    return {
      userId: user.id,
      organizationId: membership.organizationId,
      role: membership.role,
      permissions: permissionsFor(membership.role),
    };
  }
}
