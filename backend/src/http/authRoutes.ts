import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { normalizeEmail } from "../auth/email";
import { permissionsFor } from "../auth/permissions";
import {
  AUTHENTICATION_FAILED,
  REGISTRATION_REJECTED,
  TOO_MANY_ATTEMPTS,
  type AuthRuntime,
} from "../auth/runtime";
import { registerAccount } from "../auth/registration";
import { deriveCsrfToken } from "../auth/csrfToken";
import { sha256Hex } from "../auth/secrets";
import { openSession } from "../auth/sessions";
import { clientAddress } from "./clientAddress";
import { readCookie, writeSessionCookie } from "./cookies";
import type { HttpDependencies } from "./deps";
import { parseBody } from "./jsonBody";
import { headerText } from "./origin";
import { sendJson } from "./reply";

const registerSchema = z
  .object({
    email: z.string().min(1).max(320),
    password: z.string().max(500),
    code: z.string().min(1).max(500),
    organization_name: z.string().max(200).optional(),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().min(1).max(320),
    password: z.string().max(500),
  })
  .strict();

const invitationSchema = z.object({}).strict();

export function registerAuthRoutes(
  app: FastifyInstance,
  runtime: AuthRuntime,
  deps: HttpDependencies,
): void {
  app.post("/auth/register", async (request, reply) => {
    if (!runtime.limiter.allow(`register-ip:${clientAddress(request, runtime.trustedProxies)}`)) {
      return sendJson(reply, 429, { detail: TOO_MANY_ATTEMPTS });
    }
    const body = parseBody(registerSchema, request.body);
    const email = normalizeEmail(body.email);
    if (!runtime.limiter.allow(`register-email:${email}`)) {
      return sendJson(reply, 429, { detail: TOO_MANY_ATTEMPTS });
    }
    const result = await registerAccount(
      {
        store: runtime.store,
        hasher: runtime.hasher,
        clock: runtime.clock,
        newId: runtime.newId,
        bootstrapCode: runtime.bootstrapCode,
      },
      {
        email,
        password: body.password,
        code: body.code,
        organizationName: body.organization_name,
      },
    );
    if (result === "rejected") {
      return sendJson(reply, 400, { detail: REGISTRATION_REJECTED });
    }
    return sendJson(reply, 201, { status: "accepted" });
  });

  app.post("/auth/login", async (request, reply) => {
    if (!runtime.limiter.allow(`login-ip:${clientAddress(request, runtime.trustedProxies)}`)) {
      return sendJson(reply, 429, { detail: TOO_MANY_ATTEMPTS });
    }
    const body = parseBody(loginSchema, request.body);
    const email = normalizeEmail(body.email);
    if (!runtime.limiter.allow(`login-email:${email}`)) {
      return sendJson(reply, 429, { detail: TOO_MANY_ATTEMPTS });
    }
    const user = runtime.store.findUserByEmail(email);
    if (user === null) {
      await runtime.hasher.verifyDummy(body.password);
      return sendJson(reply, 401, { detail: AUTHENTICATION_FAILED });
    }
    const passwordMatches = await runtime.hasher.verify(
      user.passwordHash,
      body.password,
    );
    if (!passwordMatches || user.disabledAt !== null) {
      return sendJson(reply, 401, { detail: AUTHENTICATION_FAILED });
    }
    const membership = runtime.store.listMemberships(user.id)[0];
    if (membership === undefined) {
      return sendJson(reply, 401, { detail: AUTHENTICATION_FAILED });
    }
    const previous = readCookie(
      headerText(request.headers.cookie),
      runtime.cookieName,
    );
    if (previous !== undefined) {
      runtime.store.revokeSession(
        sha256Hex(previous),
        runtime.clock.now().toISOString(),
      );
    }
    const opened = openSession(
      runtime.store,
      runtime.clock,
      { absoluteMs: runtime.absoluteMs, idleMs: runtime.idleMs },
      user.id,
      membership.organizationId,
      runtime.randomBytes,
    );
    reply.header(
      "set-cookie",
      writeSessionCookie({
        name: runtime.cookieName,
        value: opened.token,
        maxAgeSeconds: Math.floor(runtime.absoluteMs / 1000),
        secure: runtime.secureCookie,
      }),
    );
    return sendJson(reply, 200, {
      user_id: user.id,
      organization_id: membership.organizationId,
      role: membership.role,
      permissions: permissionsFor(membership.role),
    });
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = readCookie(
      headerText(request.headers.cookie),
      runtime.cookieName,
    );
    if (token !== undefined) {
      runtime.store.revokeSession(
        sha256Hex(token),
        runtime.clock.now().toISOString(),
      );
    }
    reply.header(
      "set-cookie",
      writeSessionCookie({
        name: runtime.cookieName,
        value: "",
        maxAgeSeconds: 0,
        secure: runtime.secureCookie,
      }),
    );
    return sendJson(reply, 200, { status: "logged-out" });
  });

  app.get("/auth/me", async (request, reply) => {
    const context = requirePermission(deps.auth, "diagnostic:read");
    const token = readCookie(
      headerText(request.headers.cookie),
      runtime.cookieName,
    );
    const session =
      token === undefined
        ? null
        : runtime.store.findSession(sha256Hex(token));
    if (token === undefined || session === null) {
      return sendJson(reply, 401, { detail: "Authentication required" });
    }
    const csrfToken = deriveCsrfToken(token, runtime.csrfSecret);
    return sendJson(reply, 200, {
      user_id: context.userId,
      organization_id: context.organizationId,
      role: context.role,
      permissions: [...context.permissions],
      csrf_token: csrfToken,
    });
  });

  app.post("/auth/invitations", async (request, reply) => {
    const context = requirePermission(deps.auth, "organization:manage");
    parseBody(invitationSchema, request.body ?? {});
    const user = runtime.store.findUserById(context.userId);
    if (
      !runtime.limiter.allow(`invite-ip:${clientAddress(request, runtime.trustedProxies)}`) ||
      (user !== null && !runtime.limiter.allow(`invite-email:${user.email}`))
    ) {
      return sendJson(reply, 429, { detail: TOO_MANY_ATTEMPTS });
    }
    if (user === null) {
      return sendJson(reply, 403, { detail: "Active organization required" });
    }
    const code = runtime.randomBytes(32).toString("base64url");
    const now = runtime.clock.now();
    const invitation = {
      id: runtime.newId(),
      organizationId: context.organizationId,
      role: "member" as const,
      codeHash: sha256Hex(code),
      createdBy: user.id,
      expiresAt: new Date(now.getTime() + runtime.invitationMs).toISOString(),
      usedAt: null,
    };
    runtime.store.insertInvitation(invitation);
    return sendJson(reply, 201, {
      invitation_id: invitation.id,
      code,
      expires_at: invitation.expiresAt,
      role: invitation.role,
    });
  });
}
