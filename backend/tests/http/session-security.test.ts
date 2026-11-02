import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { Clock } from "../../src/auth/clock";
import { permissionsFor } from "../../src/auth/permissions";
import { Argon2Hasher } from "../../src/auth/passwords";
import type { AuthRuntime } from "../../src/auth/runtime";
import { sha256Hex } from "../../src/auth/secrets";
import { parseDecision } from "../../src/core/models";
import type { AIProvider, ProviderCapabilities } from "../../src/core/ports/aiProvider";
import { SqliteAuthStore } from "../../src/infrastructure/sqliteAuthStore";
import { SqliteDiagnosticRepository } from "../../src/infrastructure/sqliteDiagnosticRepository";
import { buildApp } from "../../src/http/app";
import { sessionCookieName } from "../../src/http/cookies";
import type { ImageAnalyzer, Transcriber } from "../../src/http/ports";
import { SlidingRateLimiter } from "../../src/http/rateLimit";
import { SessionAuthenticator } from "../../src/http/sessionAuth";

const ORIGIN = "http://localhost:5173";
const PASSWORD = "fixture-password-ok";
const OTHER_PASSWORD = "fixture-password-no";
const BOOTSTRAP = "bootstrap-code-fixture";
const START = Date.parse("2026-06-01T00:00:00.000Z");

class ManualClock implements Clock {
  constructor(private millis = START) {}

  now(): Date {
    return new Date(this.millis);
  }

  advance(milliseconds: number): void {
    this.millis += milliseconds;
  }
}

class AskProvider implements AIProvider {
  decideNext(): ReturnType<AIProvider["decideNext"]> {
    return parseDecision({
      tool_name: "ask_technician",
      reason: "Obtenir une observation.",
      arguments: {
        question: "Quel état est affiché ?",
        distinguishes: ["H0", "H1"],
      },
    });
  }

  capabilities(): ProviderCapabilities {
    return {
      reasoning_structured: true,
      vision: true,
      asr_streaming: false,
      tts: false,
      native_live: false,
    };
  }
}

const transcriber: Transcriber = {
  transcribe() {
    throw new Error("unused");
  },
};

const analyzer: ImageAnalyzer = {
  analyze() {
    throw new Error("unused");
  },
};

interface HarnessOptions {
  absoluteMs?: number;
  idleMs?: number;
  invitationMs?: number;
  max?: number;
  windowMs?: number;
  blockMs?: number;
  secureCookie?: boolean;
  bootstrapCode?: string;
  trustedProxies?: readonly string[];
  bootstrapAllowMultiple?: boolean;
  allowedOrigins?: readonly string[];
  logStream?: { write(chunk: string): void };
}

interface Harness {
  app: FastifyInstance;
  store: SqliteAuthStore;
  repository: SqliteDiagnosticRepository;
  clock: ManualClock;
  runtime: AuthRuntime;
  file: string;
  close: () => Promise<void>;
}

async function openHarness(options: HarnessOptions = {}): Promise<Harness> {
  const directory = mkdtempSync(path.join(tmpdir(), "bintu-auth-"));
  const file = path.join(directory, "bintu.sqlite3");
  let sequence = 0;
  const newId = () => {
    sequence += 1;
    const hex = sequence.toString(16).padStart(32, "0");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  const clock = new ManualClock();
  const repository = new SqliteDiagnosticRepository(file, { newId });
  const store = new SqliteAuthStore(file, "2026-06-01T00:00:00.000Z");
  const secureCookie = options.secureCookie === true;
  const runtime: AuthRuntime = {
    store,
    hasher: new Argon2Hasher({ memoryCost: 32, timeCost: 1, parallelism: 1 }),
    clock,
    newId,
    randomBytes,
    bootstrapCode: options.bootstrapCode ?? BOOTSTRAP,
    csrfSecret: "csrf-secret-fixture",
    trustedProxies: options.trustedProxies ?? [],
    bootstrapAllowMultiple: options.bootstrapAllowMultiple === true,
    absoluteMs: options.absoluteMs ?? 3_600_000,
    idleMs: options.idleMs ?? 3_600_000,
    invitationMs: options.invitationMs ?? 60_000,
    cookieName: sessionCookieName(secureCookie),
    secureCookie,
    allowedOrigins: options.allowedOrigins ?? [ORIGIN],
    limiter: new SlidingRateLimiter(
      {
        max: options.max ?? 20,
        windowMs: options.windowMs ?? 60_000,
        blockMs: options.blockMs ?? 60_000,
      },
      () => clock.now().getTime(),
    ),
  };
  const app = await buildApp({
    repository,
    provider: new AskProvider(),
    transcriber,
    imageAnalyzer: analyzer,
    auth: new SessionAuthenticator(runtime),
    newId,
    authRuntime: runtime,
    logStream: options.logStream,
  });
  return {
    app,
    store,
    repository,
    clock,
    runtime,
    file,
    async close() {
      await app.close();
      store.close();
      repository.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function post(
  app: FastifyInstance,
  url: string,
  payload: unknown,
  headers: Record<string, string> = {},
  ip = "127.0.0.1",
) {
  return app.inject({
    method: "POST",
    url,
    remoteAddress: ip,
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      ...headers,
    },
    payload: JSON.stringify(payload),
  });
}

function cookiePair(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (header === undefined) {
    throw new Error("missing set-cookie");
  }
  return header.split(";")[0] ?? header;
}

function cookieToken(pair: string): string {
  return pair.slice(pair.indexOf("=") + 1);
}

async function loginAs(
  app: FastifyInstance,
  email: string,
  password = PASSWORD,
): Promise<{
  cookie: string;
  token: string;
  csrf: string;
  userId: string;
  organizationId: string;
  role: string;
  permissions: string[];
}> {
  const response = await post(app, "/auth/login", { email, password });
  expect(response.statusCode).toBe(200);
  const cookie = cookiePair(response.headers["set-cookie"]);
  const me = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { cookie },
  });
  expect(me.statusCode).toBe(200);
  const profile = JSON.parse(me.body) as {
    user_id: string;
    organization_id: string;
    role: string;
    permissions: string[];
    csrf_token: string;
  };
  return {
    cookie,
    token: cookieToken(cookie),
    csrf: profile.csrf_token,
    userId: profile.user_id,
    organizationId: profile.organization_id,
    role: profile.role,
    permissions: profile.permissions,
  };
}

describe("internal authentication", () => {
  it("registers an administrator from the bootstrap code and keeps a duplicate email indistinguishable", async () => {
    const ctx = await openHarness();
    try {
      const created = await post(ctx.app, "/auth/register", {
        email: "  Éxample@Mail.COM ",
        password: "!".repeat(12),
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const duplicate = await post(ctx.app, "/auth/register", {
        email: "éxample@mail.com",
        password: OTHER_PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      expect(created.statusCode).toBe(201);
      expect(duplicate.statusCode).toBe(created.statusCode);
      expect(JSON.parse(duplicate.body)).toEqual(JSON.parse(created.body));
      expect(JSON.parse(created.body)).toEqual({ status: "accepted" });
      expect(created.headers["set-cookie"]).toBeUndefined();
      expect(duplicate.headers["set-cookie"]).toBeUndefined();
      const session = await loginAs(ctx.app, "éxample@mail.com", "!".repeat(12));
      expect(session.role).toBe("admin");
      expect(session.permissions).toEqual([...permissionsFor("admin")]);
      const rejected = await post(ctx.app, "/auth/login", {
        email: "éxample@mail.com",
        password: OTHER_PASSWORD,
      });
      expect(rejected.statusCode).toBe(401);
      const stored = ctx.store.findUserByEmail("éxample@mail.com");
      expect(stored?.passwordHash.startsWith("$argon2id$")).toBe(true);
      expect(stored?.passwordHash).not.toContain("!");
      expect(ctx.store.findSession(session.token)).toBeNull();
      expect(ctx.store.findSession(sha256Hex(session.token))?.idHash).toBe(
        sha256Hex(session.token),
      );
    } finally {
      await ctx.close();
    }
  });

  it("gives the same failure for an unknown account, a bad password, and a disabled account", async () => {
    const ctx = await openHarness();
    let dummyCalls = 0;
    const hasher = ctx.runtime.hasher;
    const verifyDummy = hasher.verifyDummy.bind(hasher);
    hasher.verifyDummy = async (password: string) => {
      dummyCalls += 1;
      await verifyDummy(password);
    };
    try {
      const unknown = await post(ctx.app, "/auth/login", {
        email: "missing@example.test",
        password: PASSWORD,
      });
      await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const session = await loginAs(ctx.app, "ada@example.test");
      const wrong = await post(ctx.app, "/auth/login", {
        email: "ada@example.test",
        password: OTHER_PASSWORD,
      });
      ctx.store.disableUser(session.userId, ctx.clock.now().toISOString());
      const disabled = await post(ctx.app, "/auth/login", {
        email: "ada@example.test",
        password: PASSWORD,
      });
      const openSession = await ctx.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: session.cookie },
      });
      expect(unknown.statusCode).toBe(401);
      expect(JSON.parse(wrong.body)).toEqual(JSON.parse(unknown.body));
      expect(JSON.parse(disabled.body)).toEqual(JSON.parse(unknown.body));
      expect(JSON.parse(openSession.body)).toEqual({ detail: "Authentication required" });
      expect(openSession.statusCode).toBe(401);
      expect(JSON.parse(unknown.body)).toEqual({ detail: "Authentication failed" });
      expect(unknown.headers["set-cookie"]).toBeUndefined();
      expect(wrong.headers["set-cookie"]).toBeUndefined();
      expect(disabled.headers["set-cookie"]).toBeUndefined();
      expect(dummyCalls).toBe(1);
    } finally {
      await ctx.close();
    }
  });

  it("refuses a short password, a bad code, and a missing organization with one registration result", async () => {
    const ctx = await openHarness();
    try {
      const short = await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: "short-pass",
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const badCode = await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: "not-a-valid-code",
        organization_name: "Atelier Alpha",
      });
      const nameless = await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "   ",
      });
      expect(short.statusCode).toBe(400);
      expect(JSON.parse(badCode.body)).toEqual(JSON.parse(short.body));
      expect(JSON.parse(nameless.body)).toEqual(JSON.parse(short.body));
      expect(JSON.parse(short.body)).toEqual({
        detail: "Registration could not be completed",
      });
      expect(ctx.store.findUserByEmail("ada@example.test")).toBeNull();
    } finally {
      await ctx.close();
    }
  });

  it("accepts a single-use invitation and rejects an expired or reused code", async () => {
    const ctx = await openHarness();
    try {
      await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const admin = await loginAs(ctx.app, "ada@example.test");
      const invitation = await post(
        ctx.app,
        "/auth/invitations",
        {},
        { cookie: admin.cookie, "x-csrf-token": admin.csrf },
      );
      expect(invitation.statusCode).toBe(201);
      const issued = JSON.parse(invitation.body) as { code: string; role: string };
      expect(issued.role).toBe("member");
      ctx.clock.advance(59_999);
      const inTime = await post(ctx.app, "/auth/register", {
        email: "bruno@example.test",
        password: "123456789012",
        code: issued.code,
      });
      expect(inTime.statusCode).toBe(201);
      const reused = await post(ctx.app, "/auth/register", {
        email: "cleo@example.test",
        password: PASSWORD,
        code: issued.code,
      });
      expect(reused.statusCode).toBe(400);
      expect(JSON.parse(reused.body)).toEqual({
        detail: "Registration could not be completed",
      });
      const second = await post(
        ctx.app,
        "/auth/invitations",
        {},
        { cookie: admin.cookie, "x-csrf-token": admin.csrf },
      );
      const secondCode = (JSON.parse(second.body) as { code: string }).code;
      ctx.clock.advance(60_000);
      const expired = await post(ctx.app, "/auth/register", {
        email: "cleo@example.test",
        password: PASSWORD,
        code: secondCode,
      });
      expect(expired.statusCode).toBe(400);
      const member = await loginAs(ctx.app, "bruno@example.test", "123456789012");
      expect(member.role).toBe("member");
      expect(member.organizationId).toBe(admin.organizationId);
      expect(member.permissions).toEqual([...permissionsFor("member")]);
      const denied = await post(
        ctx.app,
        "/auth/invitations",
        {},
        { cookie: member.cookie, "x-csrf-token": member.csrf },
      );
      expect(denied.statusCode).toBe(403);
      expect(JSON.parse(denied.body)).toEqual({ detail: "Permission denied" });
    } finally {
      await ctx.close();
    }
  });

  it("keeps an invitation available when the email already exists", async () => {
    const ctx = await openHarness();
    try {
      await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const admin = await loginAs(ctx.app, "ada@example.test");
      const invitation = await post(
        ctx.app,
        "/auth/invitations",
        {},
        { cookie: admin.cookie, "x-csrf-token": admin.csrf },
      );
      const code = (JSON.parse(invitation.body) as { code: string }).code;
      const duplicate = await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: OTHER_PASSWORD,
        code,
      });
      const fresh = await post(ctx.app, "/auth/register", {
        email: "bruno@example.test",
        password: PASSWORD,
        code,
      });
      expect(duplicate.statusCode).toBe(201);
      expect(JSON.parse(duplicate.body)).toEqual(JSON.parse(fresh.body));
      expect(ctx.store.listMemberships(admin.userId)).toHaveLength(1);
      const member = await loginAs(ctx.app, "bruno@example.test");
      expect(member.role).toBe("member");
      const still = await loginAs(ctx.app, "ada@example.test");
      expect(still.role).toBe("admin");
    } finally {
      await ctx.close();
    }
  });

  it("rejects registration when neither the bootstrap code nor an invitation matches", async () => {
    const ctx = await openHarness({ bootstrapCode: "" });
    try {
      const response = await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      expect(response.statusCode).toBe(400);
      expect(ctx.store.findUserByEmail("ada@example.test")).toBeNull();
    } finally {
      await ctx.close();
    }
  });

  it("checks origin on login and register, and csrf on every other mutation", async () => {
    const ctx = await openHarness();
    try {
      const evil = await ctx.app.inject({
        method: "POST",
        url: "/auth/login",
        headers: {
          origin: "http://evil.example",
          "content-type": "application/json",
        },
        payload: JSON.stringify({ email: "ada@example.test", password: PASSWORD }),
      });
      expect(evil.statusCode).toBe(403);
      expect(JSON.parse(evil.body)).toEqual({ detail: "Origin is not allowed" });
      expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
      const missingOrigin = await ctx.app.inject({
        method: "POST",
        url: "/auth/register",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({
          email: "ada@example.test",
          password: PASSWORD,
          code: BOOTSTRAP,
          organization_name: "Atelier Alpha",
        }),
      });
      expect(missingOrigin.statusCode).toBe(403);
      expect(ctx.store.findUserByEmail("ada@example.test")).toBeNull();
      await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const session = await loginAs(ctx.app, "ada@example.test");
      const noCookie = await post(ctx.app, "/api/investigations", {
        problem: "Le voyant reste éteint.",
      });
      expect(noCookie.statusCode).toBe(401);
      expect(JSON.parse(noCookie.body)).toEqual({ detail: "Authentication required" });
      const noCsrf = await post(
        ctx.app,
        "/api/investigations",
        { problem: "Le voyant reste éteint." },
        { cookie: session.cookie },
      );
      expect(noCsrf.statusCode).toBe(403);
      expect(JSON.parse(noCsrf.body)).toEqual({ detail: "CSRF validation failed" });
      const wrongCsrf = await post(
        ctx.app,
        "/api/investigations",
        { problem: "Le voyant reste éteint." },
        { cookie: session.cookie, "x-csrf-token": "not-the-token" },
      );
      expect(wrongCsrf.statusCode).toBe(403);
      const anonymous = await ctx.app.inject({
        method: "GET",
        url: "/api/investigations",
      });
      expect(anonymous.statusCode).toBe(401);
      const health = await ctx.app.inject({ method: "GET", url: "/api/health" });
      expect(health.statusCode).toBe(200);
    } finally {
      await ctx.close();
    }
  });

  it("keeps the same csrf token for the whole session", async () => {
    const ctx = await openHarness();
    try {
      const extra = await post(ctx.app, "/auth/login", {
        email: "ada@example.test",
        password: PASSWORD,
        user_id: "user_test_technician",
        organization_id: "org_test_alpha",
        role: "admin",
      });
      expect(extra.statusCode).toBe(422);
      expect(JSON.parse(extra.body)).toEqual({ detail: "Invalid request" });
      expect(extra.body).not.toContain(PASSWORD);
      await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const ada = await loginAs(ctx.app, "ada@example.test");
      const again = await ctx.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: ada.cookie },
      });
      const repeated = (JSON.parse(again.body) as { csrf_token: string }).csrf_token;
      expect(repeated).toBe(ada.csrf);
      const invitation = await post(
        ctx.app,
        "/auth/invitations",
        {},
        { cookie: ada.cookie, "x-csrf-token": ada.csrf },
      );
      const code = (JSON.parse(invitation.body) as { code: string }).code;
      await post(ctx.app, "/auth/register", {
        email: "bruno@example.test",
        password: PASSWORD,
        code,
      });
      const bruno = await loginAs(ctx.app, "bruno@example.test");
      const foreign = await post(
        ctx.app,
        "/auth/logout",
        {},
        { cookie: ada.cookie, "x-csrf-token": bruno.csrf },
      );
      expect(foreign.statusCode).toBe(403);
      expect(JSON.parse(foreign.body)).toEqual({ detail: "CSRF validation failed" });
      const [first, second] = await Promise.all([
        post(ctx.app, "/auth/invitations", {}, { cookie: ada.cookie, "x-csrf-token": ada.csrf }),
        post(ctx.app, "/auth/invitations", {}, { cookie: ada.cookie, "x-csrf-token": ada.csrf }),
      ]);
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      const loggedOut = await post(
        ctx.app,
        "/auth/logout",
        {},
        { cookie: ada.cookie, "x-csrf-token": ada.csrf },
      );
      expect(loggedOut.statusCode).toBe(200);
      const cleared = loggedOut.headers["set-cookie"];
      expect(typeof cleared).toBe("string");
      expect(cleared).toContain("bintu_session=");
      expect(cleared).toContain("Max-Age=0");
      expect(cleared).toContain("HttpOnly");
      const after = await ctx.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: ada.cookie },
      });
      expect(after.statusCode).toBe(401);
    } finally {
      await ctx.close();
    }
  });

  it("issues a new session on every login and describes the cookie", async () => {
    const ctx = await openHarness();
    try {
      await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const first = await post(ctx.app, "/auth/login", {
        email: "ada@example.test",
        password: PASSWORD,
      });
      const firstCookie = cookiePair(first.headers["set-cookie"]);
      const attributes = (first.headers["set-cookie"] as string).split(";").slice(1).join(";");
      expect(attributes).toContain("HttpOnly");
      expect(attributes).toContain("SameSite=Lax");
      expect(attributes).toContain("Path=/");
      expect(attributes).toContain("Max-Age=3600");
      expect(attributes).not.toContain("Secure");
      expect(attributes).not.toContain("Domain=");
      expect(firstCookie.startsWith("bintu_session=")).toBe(true);
      const second = await post(
        ctx.app,
        "/auth/login",
        { email: "ada@example.test", password: PASSWORD },
        { cookie: firstCookie },
      );
      const secondCookie = cookiePair(second.headers["set-cookie"]);
      expect(secondCookie).not.toBe(firstCookie);
      const stale = await ctx.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: firstCookie },
      });
      const current = await ctx.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: secondCookie },
      });
      expect(stale.statusCode).toBe(401);
      expect(current.statusCode).toBe(200);
      expect(ctx.store.findSession(sha256Hex(cookieToken(firstCookie)))?.revokedAt).not.toBeNull();
    } finally {
      await ctx.close();
    }
  });

  it("uses the host prefix and the secure attribute in production", async () => {
    const ctx = await openHarness({ secureCookie: true });
    try {
      await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const response = await post(ctx.app, "/auth/login", {
        email: "ada@example.test",
        password: PASSWORD,
      });
      const header = response.headers["set-cookie"];
      expect(typeof header).toBe("string");
      const attributes = (header as string).split(";").slice(1).join(";");
      expect((header as string).startsWith("__Host-bintu_session=")).toBe(true);
      expect(attributes).toContain("Secure");
      expect(attributes).toContain("Path=/");
      expect(attributes).not.toContain("Domain=");
    } finally {
      await ctx.close();
    }
  });

  it("expires a session at the absolute limit and after inactivity", async () => {
    const absolute = await openHarness({ absoluteMs: 5_000, idleMs: 60_000 });
    try {
      await post(absolute.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const session = await loginAs(absolute.app, "ada@example.test");
      absolute.clock.advance(5_000);
      const expired = await absolute.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: session.cookie },
      });
      expect(expired.statusCode).toBe(401);
    } finally {
      await absolute.close();
    }

    const idle = await openHarness({ absoluteMs: 60_000, idleMs: 5_000 });
    try {
      await post(idle.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const created = await post(idle.app, "/auth/login", {
        email: "ada@example.test",
        password: PASSWORD,
      });
      idle.clock.advance(5_000);
      const expired = await idle.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: cookiePair(created.headers["set-cookie"]) },
      });
      expect(expired.statusCode).toBe(401);
    } finally {
      await idle.close();
    }
  });

  it("blocks register, login, and invitations for a while, and leaves diagnostic reads unlimited", async () => {
    const ctx = await openHarness({
      max: 2,
      windowMs: 5_000,
      blockMs: 5_000,
      bootstrapAllowMultiple: true,
    });
    try {
      const first = await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const second = await post(ctx.app, "/auth/register", {
        email: "bruno@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Beta",
      });
      const blocked = await post(ctx.app, "/auth/register", {
        email: "cleo@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Gamma",
      });
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(blocked.statusCode).toBe(429);
      expect(JSON.parse(blocked.body)).toEqual({ detail: "Too many attempts" });
      ctx.clock.advance(5_000);
      const restored = await post(ctx.app, "/auth/register", {
        email: "cleo@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Gamma",
      });
      expect(restored.statusCode).toBe(201);
      const bad = await post(ctx.app, "/auth/login", {
        email: "ada@example.test",
        password: OTHER_PASSWORD,
      });
      const badAgain = await post(ctx.app, "/auth/login", {
        email: "ada@example.test",
        password: OTHER_PASSWORD,
      });
      const limited = await post(
        ctx.app,
        "/auth/login",
        { email: "ada@example.test", password: PASSWORD },
        { "x-forwarded-for": "198.51.100.20" },
      );
      expect(bad.statusCode).toBe(401);
      expect(badAgain.statusCode).toBe(401);
      expect(limited.statusCode).toBe(429);
      ctx.clock.advance(5_000);
      const session = await loginAs(ctx.app, "ada@example.test");
      const invitation = await post(
        ctx.app,
        "/auth/invitations",
        {},
        { cookie: session.cookie, "x-csrf-token": session.csrf },
      );
      const another = await post(
        ctx.app,
        "/auth/invitations",
        {},
        { cookie: session.cookie, "x-csrf-token": session.csrf },
      );
      const inviteBlocked = await post(
        ctx.app,
        "/auth/invitations",
        {},
        { cookie: session.cookie, "x-csrf-token": session.csrf },
      );
      expect(invitation.statusCode).toBe(201);
      expect(another.statusCode).toBe(201);
      expect(inviteBlocked.statusCode).toBe(429);
      for (let index = 0; index < 8; index += 1) {
        const listed = await ctx.app.inject({
          method: "GET",
          url: "/api/investigations",
          headers: { cookie: session.cookie },
        });
        expect(listed.statusCode).toBe(200);
      }
    } finally {
      await ctx.close();
    }
  });

  it("isolates two organizations and hides diagnostics that have no organization", async () => {
    const ctx = await openHarness({ bootstrapAllowMultiple: true });
    try {
      await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      await post(ctx.app, "/auth/register", {
        email: "bruno@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Beta",
      });
      const ada = await loginAs(ctx.app, "ada@example.test");
      const bruno = await loginAs(ctx.app, "bruno@example.test");
      const created = await post(
        ctx.app,
        "/api/investigations",
        { problem: "Le voyant reste éteint." },
        { cookie: ada.cookie, "x-csrf-token": ada.csrf },
      );
      const other = await post(
        ctx.app,
        "/api/investigations",
        { problem: "Le voyant reste éteint." },
        { cookie: bruno.cookie, "x-csrf-token": bruno.csrf },
      );
      expect(created.statusCode).toBe(201);
      expect(other.statusCode).toBe(201);
      const adaId = (JSON.parse(created.body) as { investigation_id: string }).investigation_id;
      const brunoId = (JSON.parse(other.body) as { investigation_id: string }).investigation_id;
      const own = await ctx.app.inject({
        method: "GET",
        url: `/api/investigations/${adaId}`,
        headers: { cookie: ada.cookie },
      });
      const foreign = await ctx.app.inject({
        method: "GET",
        url: `/api/investigations/${adaId}`,
        headers: { cookie: bruno.cookie },
      });
      const unknown = await ctx.app.inject({
        method: "GET",
        url: "/api/investigations/00000000-0000-0000-0000-000000000099",
        headers: { cookie: ada.cookie },
      });
      expect(own.statusCode).toBe(200);
      expect(foreign.statusCode).toBe(404);
      expect(JSON.parse(foreign.body)).toEqual({ detail: "Investigation not found" });
      expect(unknown.statusCode).toBe(404);
      ctx.repository.insertRaw({
        id: "legacy-without-organization",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        status: "investigating",
        stateJson: "{}",
        organizationId: null,
        createdByUserId: null,
        stateSchemaVersion: 1,
        stateRevision: 0,
      });
      const hidden = await ctx.app.inject({
        method: "GET",
        url: "/api/investigations/legacy-without-organization",
        headers: { cookie: ada.cookie },
      });
      const listed = await ctx.app.inject({
        method: "GET",
        url: "/api/investigations",
        headers: { cookie: ada.cookie },
      });
      expect(hidden.statusCode).toBe(404);
      expect(JSON.parse(listed.body) as { investigation_id: string }[]).toEqual([
        expect.objectContaining({ investigation_id: adaId }),
      ]);
      expect(listed.body).not.toContain(brunoId);
      expect(listed.body).not.toContain("legacy-without-organization");
      expect(countWhere(ctx.file, "organization_id IS NULL")).toBe(1);
      const probe = new Database(ctx.file);
      probe.prepare("DELETE FROM memberships WHERE user_id = ?").run(ada.userId);
      probe.close();
      const noOrganization = await ctx.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: ada.cookie },
      });
      expect(noOrganization.statusCode).toBe(403);
      expect(JSON.parse(noOrganization.body)).toEqual({
        detail: "Active organization required",
      });
    } finally {
      await ctx.close();
    }
  });

  it("does not write passwords, cookies, csrf tokens, invitation codes, or api keys to the log", async () => {
    const lines: string[] = [];
    const ctx = await openHarness({
      logStream: {
        write(chunk: string) {
          lines.push(chunk);
        },
      },
    });
    try {
      await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const response = await ctx.app.inject({
        method: "POST",
        url: "/auth/login",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          authorization: "Bearer fixture-token-value",
          "x-note": "sk-fixturekey1234",
        },
        payload: JSON.stringify({ email: "ada@example.test", password: PASSWORD }),
      });
      const cookie = cookiePair(response.headers["set-cookie"]);
      const me = await ctx.app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie },
      });
      const csrf = (JSON.parse(me.body) as { csrf_token: string }).csrf_token;
      const invitation = await post(
        ctx.app,
        "/auth/invitations",
        {},
        { cookie, "x-csrf-token": csrf },
      );
      const code = (JSON.parse(invitation.body) as { code: string }).code;
      const log = lines.join("\n");
      expect(log).not.toContain(PASSWORD);
      expect(log).not.toContain(BOOTSTRAP);
      expect(log).not.toContain(cookieToken(cookie));
      expect(log).not.toContain(csrf);
      expect(log).not.toContain(code);
      expect(log).not.toContain("sk-fixturekey1234");
      expect(log).not.toContain("fixture-token-value");
    } finally {
      await ctx.close();
    }
  });

  it("counts the forwarded client only when the peer is a trusted proxy", async () => {
    const trusted = await openHarness({
      max: 1,
      trustedProxies: ["127.0.0.1", "::ffff:127.0.0.1"],
    });
    try {
      const first = await post(
        trusted.app,
        "/auth/login",
        { email: "ada@example.test", password: PASSWORD },
        { "x-forwarded-for": "203.0.113.10" },
        "127.0.0.1",
      );
      const sameClient = await post(
        trusted.app,
        "/auth/login",
        { email: "ada@example.test", password: PASSWORD },
        { "x-forwarded-for": "203.0.113.10" },
        "127.0.0.1",
      );
      const otherClient = await post(
        trusted.app,
        "/auth/login",
        { email: "bruno@example.test", password: PASSWORD },
        { "x-forwarded-for": "203.0.113.11" },
        "127.0.0.1",
      );
      expect(first.statusCode).toBe(401);
      expect(sameClient.statusCode).toBe(429);
      expect(otherClient.statusCode).toBe(401);
    } finally {
      await trusted.close();
    }

    const direct = await openHarness({ max: 1, trustedProxies: ["10.0.0.8"] });
    try {
      const first = await post(
        direct.app,
        "/auth/login",
        { email: "ada@example.test", password: PASSWORD },
        { "x-forwarded-for": "203.0.113.20" },
        "192.0.2.5",
      );
      const spoofed = await post(
        direct.app,
        "/auth/login",
        { email: "bruno@example.test", password: OTHER_PASSWORD },
        { "x-forwarded-for": "198.51.100.30" },
        "192.0.2.5",
      );
      expect(first.statusCode).toBe(401);
      expect(spoofed.statusCode).toBe(429);
    } finally {
      await direct.close();
    }
  });

  it("creates another organization with the bootstrap code only when that is allowed", async () => {
    const closed = await openHarness();
    try {
      const first = await post(closed.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const sameEmail = await post(closed.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const second = await post(closed.app, "/auth/register", {
        email: "bruno@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Beta",
      });
      expect(first.statusCode).toBe(201);
      expect(sameEmail.statusCode).toBe(201);
      expect(JSON.parse(sameEmail.body)).toEqual({ status: "accepted" });
      expect(second.statusCode).toBe(400);
      expect(JSON.parse(second.body)).toEqual({
        detail: "Registration could not be completed",
      });
      expect(closed.store.countOrganizations()).toBe(1);
    } finally {
      await closed.close();
    }

    const opened = await openHarness({ bootstrapAllowMultiple: true });
    try {
      const first = await post(opened.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const second = await post(opened.app, "/auth/register", {
        email: "bruno@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Beta",
      });
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(opened.store.countOrganizations()).toBe(2);
    } finally {
      await opened.close();
    }
  });

  it("hashes the password when the email already exists", async () => {
    const ctx = await openHarness();
    const hash = vi.spyOn(ctx.runtime.hasher, "hash");
    try {
      const created = await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const duplicate = await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      expect(created.statusCode).toBe(201);
      expect(duplicate.statusCode).toBe(201);
      expect(hash).toHaveBeenCalledTimes(2);
      expect(hash).toHaveBeenNthCalledWith(1, PASSWORD);
      expect(hash).toHaveBeenNthCalledWith(2, PASSWORD);
    } finally {
      hash.mockRestore();
      await ctx.close();
    }
  });

  it("rejects a mutation once the session is no longer active", async () => {
    const ctx = await openHarness({ absoluteMs: 5_000, idleMs: 60_000 });
    try {
      await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const session = await loginAs(ctx.app, "ada@example.test");
      ctx.clock.advance(5_000);
      const expired = await post(
        ctx.app,
        "/auth/logout",
        {},
        { cookie: session.cookie, "x-csrf-token": session.csrf },
      );
      const unknown = await post(
        ctx.app,
        "/auth/logout",
        {},
        { cookie: "bintu_session=not-a-session", "x-csrf-token": session.csrf },
      );
      expect(expired.statusCode).toBe(401);
      expect(JSON.parse(expired.body)).toEqual({ detail: "Authentication required" });
      expect(unknown.statusCode).toBe(401);
      expect(JSON.parse(unknown.body)).toEqual({ detail: "Authentication required" });
    } finally {
      await ctx.close();
    }
  });

  it("refuses an invitation when the account disappears and a login without a membership", async () => {
    const ctx = await openHarness();
    const original = ctx.store.findUserById.bind(ctx.store);
    let lookups = 0;
    let findUser: ReturnType<typeof vi.spyOn> | undefined;
    try {
      await post(ctx.app, "/auth/register", {
        email: "ada@example.test",
        password: PASSWORD,
        code: BOOTSTRAP,
        organization_name: "Atelier Alpha",
      });
      const session = await loginAs(ctx.app, "ada@example.test");
      findUser = vi.spyOn(ctx.store, "findUserById").mockImplementation((id: string) => {
        lookups += 1;
        if (lookups > 1) {
          return null;
        }
        return original(id);
      });
      const invitation = await post(
        ctx.app,
        "/auth/invitations",
        {},
        { cookie: session.cookie, "x-csrf-token": session.csrf },
      );
      expect(invitation.statusCode).toBe(403);
      expect(JSON.parse(invitation.body)).toEqual({
        detail: "Active organization required",
      });
      findUser.mockRestore();
      const passwordHash = await ctx.runtime.hasher.hash(PASSWORD);
      ctx.store.insertUser({
        id: "00000000-0000-4000-8000-000000000099",
        email: "solo@example.test",
        passwordHash,
        createdAt: ctx.clock.now().toISOString(),
        disabledAt: null,
      });
      const alone = await post(ctx.app, "/auth/login", {
        email: "solo@example.test",
        password: PASSWORD,
      });
      expect(alone.statusCode).toBe(401);
      expect(JSON.parse(alone.body)).toEqual({ detail: "Authentication failed" });
    } finally {
      findUser?.mockRestore();
      await ctx.close();
    }
  });
});

function countWhere(filename: string, clause: string): number {
  const database = new Database(filename, { readonly: true });
  try {
    const row = database
      .prepare(`SELECT COUNT(*) AS n FROM investigations WHERE ${clause}`)
      .get() as { n: number };
    return row.n;
  } finally {
    database.close();
  }
}
