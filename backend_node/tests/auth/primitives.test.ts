import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { beforeAll, describe, expect, it } from "vitest";

import { systemClock } from "../../src/auth/clock";
import { readAuthSettings } from "../../src/auth/config";
import {
  addressForQuota,
  isTrustedProxy,
  normalizeIp,
  parseTrustedProxies,
} from "../../src/auth/trustedProxy";
import { normalizeEmail } from "../../src/auth/email";
import {
  Argon2Hasher,
  isAcceptablePassword,
  PRODUCTION_ARGON2,
} from "../../src/auth/passwords";
import { digestsEqual, secretsEqual, sha256Hex } from "../../src/auth/secrets";
import { openSession, sessionIsActive } from "../../src/auth/sessions";
import type { SessionRecord } from "../../src/auth/store";
import { AUTH_MIGRATIONS } from "../../src/infrastructure/authMigrations";
import { SqliteAuthStore } from "../../src/infrastructure/sqliteAuthStore";
import { SqliteDiagnosticRepository } from "../../src/infrastructure/sqliteDiagnosticRepository";
import { writeSessionCookie } from "../../src/http/cookies";
import { originAllowed } from "../../src/http/origin";
import { SlidingRateLimiter } from "../../src/http/rateLimit";
import { redactStructured, redactText } from "../../src/http/redact";

const START = Date.parse("2026-06-01T00:00:00.000Z");
const CSRF_SECRET = "csrf-secret-fixture-value-32bytes!!";
const SESSION_SECRET = "session-secret-fixture-value-32b!!";

function productionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    BINTU_ENV: "production",
    BINTU_CSRF_SECRET: CSRF_SECRET,
    BINTU_SESSION_SECRET: SESSION_SECRET,
    BINTU_ARGON2_MEMORY_KIB: String(PRODUCTION_ARGON2.memoryCost),
    BINTU_ARGON2_TIME_COST: String(PRODUCTION_ARGON2.timeCost),
    BINTU_ARGON2_PARALLELISM: String(PRODUCTION_ARGON2.parallelism),
    ...overrides,
  };
}

function messageOf(env: NodeJS.ProcessEnv): string {
  try {
    readAuthSettings(env);
    throw new Error("expected production configuration to fail");
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("auth primitives", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    await new Argon2Hasher({ memoryCost: 32, timeCost: 1, parallelism: 1 }).hash(
      "fixture-password-ok",
    );
  });
  it("normalizes email without a composition rule on passwords", () => {
    expect(normalizeEmail("  Éxample@Mail.COM ")).toBe("éxample@mail.com");
    expect(normalizeEmail("Ａda@\nExample.TEST")).toBe("ada@example.test");
    expect(isAcceptablePassword("short-pass")).toBe(false);
    expect(isAcceptablePassword("123456789012")).toBe(true);
    expect(isAcceptablePassword("!".repeat(12))).toBe(true);
    expect(isAcceptablePassword("😀".repeat(11))).toBe(false);
    expect(isAcceptablePassword("😀".repeat(12))).toBe(true);
    expect(isAcceptablePassword("a".repeat(128))).toBe(true);
    expect(isAcceptablePassword("a".repeat(129))).toBe(false);
  });

  it("hashes with the configured Argon2id parameters", async () => {
    const hasher = new Argon2Hasher({ memoryCost: 32, timeCost: 1, parallelism: 1 });
    const encoded = await hasher.hash("fixture-password-ok");
    expect(encoded.startsWith("$argon2id$v=19$m=32,t=1,p=1$")).toBe(true);
    expect(encoded).not.toContain("fixture-password-ok");
    expect(await hasher.verify(encoded, "fixture-password-ok")).toBe(true);
    expect(await hasher.verify(encoded, "fixture-password-no")).toBe(false);
    await hasher.verifyDummy("fixture-password-no");
    expect(PRODUCTION_ARGON2).toEqual({
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  it("compares secrets by digest and keeps session tokens hashed", () => {
    expect(secretsEqual("bootstrap-code-fixture", "bootstrap-code-fixture")).toBe(true);
    expect(secretsEqual("bootstrap-code-fixture", "other-code-fixture")).toBe(false);
    expect(digestsEqual("abcd", "ab")).toBe(false);
    expect(digestsEqual("abcd", "abce")).toBe(false);
    expect(digestsEqual("abcd", "abcd")).toBe(true);
    const directory = mkdtempSync(path.join(tmpdir(), "bintu-session-"));
    const store = new SqliteAuthStore(path.join(directory, "auth.sqlite3"), "2026-06-01T00:00:00.000Z");
    try {
      const now = "2026-06-01T00:00:00.000Z";
      store.insertUser({
        id: "user-ada",
        email: "ada@example.test",
        passwordHash: "stored-hash",
        createdAt: now,
        disabledAt: null,
      });
      store.insertOrganization({
        id: "org-alpha",
        name: "Alpha",
        createdAt: now,
      });
      const opened = openSession(
        store,
        { now: () => new Date(START) },
        { absoluteMs: 5_000, idleMs: 5_000 },
        "user-ada",
        "org-alpha",
        () => Buffer.from("0123456789abcdef0123456789abcdef"),
      );
      expect(opened.token).not.toBe(opened.record.idHash);
      expect(store.findSession(opened.token)).toBeNull();
      expect(store.findSession(sha256Hex(opened.token))?.idHash).toBe(sha256Hex(opened.token));
      const stored = JSON.stringify(store.findSession(sha256Hex(opened.token)));
      expect(stored).not.toContain(opened.token);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("expires a session on revocation, the absolute limit, and the idle limit", () => {
    const session: SessionRecord = {
      idHash: "hash",
      userId: "user-ada",
      organizationId: "org-alpha",
      createdAt: new Date(START).toISOString(),
      lastSeenAt: new Date(START).toISOString(),
      expiresAt: new Date(START + 5_000).toISOString(),
      revokedAt: null,
    };
    expect(sessionIsActive(session, new Date(START + 4_999), 60_000)).toBe(true);
    expect(sessionIsActive(session, new Date(START + 5_000), 60_000)).toBe(false);
    expect(sessionIsActive(session, new Date(START + 5_000), 5_000)).toBe(false);
    expect(
      sessionIsActive(
        { ...session, expiresAt: new Date(START + 60_000).toISOString() },
        new Date(START + 5_000),
        5_000,
      ),
    ).toBe(false);
    expect(sessionIsActive({ ...session, revokedAt: session.createdAt }, new Date(START), 60_000)).toBe(
      false,
    );
  });

  it("builds a host-only cookie and an exact origin list", () => {
    const development = writeSessionCookie({
      name: "bintu_session",
      value: "token",
      maxAgeSeconds: 3600,
      secure: false,
    });
    expect(development).toContain("bintu_session=token");
    expect(development).toContain("HttpOnly");
    expect(development).toContain("SameSite=Lax");
    expect(development).toContain("Path=/");
    expect(development).toContain("Max-Age=3600");
    expect(development).not.toContain("Secure");
    expect(development).not.toContain("Domain=");
    const production = writeSessionCookie({
      name: "__Host-bintu_session",
      value: "token",
      maxAgeSeconds: 3600,
      secure: true,
    });
    expect(production).toContain("__Host-bintu_session=token");
    expect(production).toContain("Secure");
    expect(originAllowed("http://localhost:5173", ["http://localhost:5173"])).toBe(true);
    expect(originAllowed("http://evil.example", ["http://localhost:5173"])).toBe(false);
    expect(originAllowed(undefined, ["http://localhost:5173"])).toBe(false);
  });

  it("blocks for a limited time and then accepts again", () => {
    let now = START;
    const limiter = new SlidingRateLimiter(
      { max: 2, windowMs: 5_000, blockMs: 5_000 },
      () => now,
    );
    expect(limiter.allow("login-ip:203.0.113.8")).toBe(true);
    expect(limiter.allow("login-ip:203.0.113.8")).toBe(true);
    expect(limiter.allow("login-ip:203.0.113.8")).toBe(false);
    now += 5_000;
    expect(limiter.allow("login-ip:203.0.113.8")).toBe(true);
  });

  it("redacts passwords, cookies, csrf tokens, invitation codes, and api keys", () => {
    expect(
      redactStructured({
        password: "fixture-password-ok",
        code: "bootstrap-code-fixture",
        csrf_token: "fixture-csrf-token",
        cookie: "bintu_session=fixture-session-token",
        nested: [{ authorization: "Bearer fixture-token-value" }],
      }),
    ).toEqual({
      password: "[redacted]",
      code: "[redacted]",
      csrf_token: "[redacted]",
      cookie: "[redacted]",
      nested: [{ authorization: "[redacted]" }],
    });
    const text = redactText(
      '{"password":"fixture-password-ok","code":"bootstrap-code-fixture"} bintu_session=fixture-session-token __Host-bintu_session=fixture-host-token x-csrf-token: fixture-csrf-token sk-fixturekey1234 Bearer fixture-token-value',
    );
    expect(text).not.toContain("fixture-password-ok");
    expect(text).not.toContain("bootstrap-code-fixture");
    expect(text).not.toContain("fixture-session-token");
    expect(text).not.toContain("fixture-host-token");
    expect(text).not.toContain("fixture-csrf-token");
    expect(text).not.toContain("sk-fixturekey1234");
    expect(text).not.toContain("fixture-token-value");
  });

  it("reads documented defaults and fails closed in production", () => {
    expect(readAuthSettings({}).allowedOrigins).toEqual(["http://localhost:5173"]);
    expect(readAuthSettings({}).argon2).toEqual(PRODUCTION_ARGON2);
    expect(readAuthSettings({}).sessionSecret).toBe("");
    expect(readAuthSettings({ BINTU_SESSION_ABSOLUTE_SECONDS: "" }).absoluteMs).toBe(
      12 * 60 * 60 * 1000,
    );
    expect(readAuthSettings({ BINTU_SESSION_IDLE_SECONDS: "0" }).idleMs).toBe(60 * 60 * 1000);
    expect(readAuthSettings({ BINTU_RATE_LIMIT_MAX: "1.5" }).rateLimit.max).toBe(5);
    expect(readAuthSettings(productionEnv()).allowedOrigins).toEqual([]);
    expect(readAuthSettings(productionEnv()).argon2).toEqual(PRODUCTION_ARGON2);
    expect(readAuthSettings({ BINTU_ARGON2_MEMORY_KIB: "nope" }).argon2.memoryCost).toBe(
      PRODUCTION_ARGON2.memoryCost,
    );
    expect(
      readAuthSettings({ BINTU_ALLOWED_ORIGINS: "http://localhost:5173, http://127.0.0.1:5173" })
        .allowedOrigins,
    ).toEqual(["http://localhost:5173", "http://127.0.0.1:5173"]);
    expect(readAuthSettings({}).csrfSecret).toBe("");
    expect(readAuthSettings({ BINTU_CSRF_SECRET: "csrf-secret-fixture" }).csrfSecret).toBe(
      "csrf-secret-fixture",
    );
    expect(readAuthSettings({}).bootstrapAllowMultiple).toBe(false);
    expect(
      readAuthSettings({ BINTU_BOOTSTRAP_ALLOW_MULTIPLE: "true" }).bootstrapAllowMultiple,
    ).toBe(true);
    expect(
      readAuthSettings({ BINTU_BOOTSTRAP_ALLOW_MULTIPLE: "yes" }).bootstrapAllowMultiple,
    ).toBe(false);
    expect(readAuthSettings({}).trustedProxies).toEqual([]);
    expect(readAuthSettings({ BINTU_TRUSTED_PROXIES: "127.0.0.1, 10.0.0.0/8" }).trustedProxies).toEqual([
      "127.0.0.1",
      "10.0.0.0/8",
    ]);
    expect(isTrustedProxy("10.1.2.3", ["10.0.0.0/8"])).toBe(true);
    expect(isTrustedProxy("11.0.0.1", ["10.0.0.0/8"])).toBe(false);
    expect(isTrustedProxy("203.0.113.8", ["0.0.0.0/0", "*"])).toBe(false);
    expect(isTrustedProxy("::ffff:127.0.0.1", ["127.0.0.1"])).toBe(true);
    expect(addressForQuota("192.0.2.5", "203.0.113.9", [])).toBe("192.0.2.5");
    expect(addressForQuota("127.0.0.1", "203.0.113.9, 10.0.0.1", ["127.0.0.1"])).toBe(
      "203.0.113.9",
    );
  });

  it("keeps the system clock on wall time", () => {
    const before = Date.now();
    const stamped = systemClock().now().getTime();
    const after = Date.now();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it("resolves quota addresses for trusted proxies without trusting a forged header", () => {
    expect(parseTrustedProxies(undefined)).toEqual([]);
    expect(parseTrustedProxies("")).toEqual([]);
    expect(parseTrustedProxies(" 10.0.0.1 , , 10.0.0.0/8 ")).toEqual([
      "10.0.0.1",
      "10.0.0.0/8",
    ]);
    expect(normalizeIp("::FFFF:203.0.113.10")).toBe("203.0.113.10");
    expect(normalizeIp("::ffff:not-an-ip")).toBe("::ffff:not-an-ip");
    expect(normalizeIp(" 2001:DB8::1 ")).toBe("2001:db8::1");

    expect(isTrustedProxy("192.0.2.1", ["192.0.2.1"])).toBe(true);
    expect(isTrustedProxy("192.0.2.2", ["192.0.2.1"])).toBe(false);
    expect(isTrustedProxy("10.4.5.6", ["10.0.0.0/8"])).toBe(true);
    expect(isTrustedProxy("10.4.5.6", ["10.0.0.0/0"])).toBe(false);
    expect(isTrustedProxy("10.4.5.6", ["10.0.0.0/33"])).toBe(false);
    expect(isTrustedProxy("10.4.5.6", ["10.0.0.0/abc"])).toBe(false);
    expect(isTrustedProxy("10.4.5.6", ["bad/8"])).toBe(false);
    expect(isTrustedProxy("10.4.5.256", ["10.0.0.0/8"])).toBe(false);
    expect(isTrustedProxy("10.4.5", ["10.0.0.0/8"])).toBe(false);
    expect(isTrustedProxy("10.4.5.6", ["10.0.0.0/32"])).toBe(false);
    expect(isTrustedProxy("10.0.0.0", ["10.0.0.0/32"])).toBe(true);

    expect(isTrustedProxy("2001:db8::1", ["2001:db8::1"])).toBe(true);
    expect(isTrustedProxy("2001:db8::2", ["2001:db8::/32"])).toBe(true);
    expect(isTrustedProxy("2001:db9::1", ["2001:db8::/32"])).toBe(false);
    expect(isTrustedProxy("2001:db8::1", ["2001:db8::/0"])).toBe(false);
    expect(isTrustedProxy("2001:db8::1", ["2001:db8::/129"])).toBe(false);
    expect(isTrustedProxy("2001:db8::1", ["::/0"])).toBe(false);
    expect(isTrustedProxy("2001:db8::1", ["*"])).toBe(false);
    expect(isTrustedProxy("2001:db8::ffff:192.0.2.1", ["2001:db8::/32"])).toBe(false);
    expect(isTrustedProxy("2001:db8:::1", ["2001:db8::/32"])).toBe(false);
    expect(isTrustedProxy("2001:db8::gggg", ["2001:db8::/32"])).toBe(false);
    expect(isTrustedProxy("1:2:3:4:5:6:7:8:9", ["1:2:3:4:5:6:7:8:9/128"])).toBe(false);
    expect(isTrustedProxy("::1", ["::1/128"])).toBe(true);
    expect(isTrustedProxy("::ffff:127.0.0.1", ["127.0.0.1/32"])).toBe(true);

    expect(addressForQuota("192.0.2.5", undefined, ["192.0.2.5"])).toBe("192.0.2.5");
    expect(addressForQuota("192.0.2.5", "", ["192.0.2.5"])).toBe("192.0.2.5");
    expect(addressForQuota("192.0.2.5", "  , 10.0.0.1", ["192.0.2.5"])).toBe("192.0.2.5");
    expect(
      addressForQuota("10.0.0.8", "203.0.113.9, 10.0.0.8, 198.51.100.1", ["10.0.0.8"]),
    ).toBe("203.0.113.9");
    expect(
      addressForQuota("10.0.0.8", "203.0.113.9, 10.0.0.8, 198.51.100.1", ["10.0.0.0/8"]),
    ).toBe("203.0.113.9");
    expect(
      addressForQuota("192.0.2.5", "203.0.113.9, 198.51.100.1", ["10.0.0.8"]),
    ).toBe("192.0.2.5");
    expect(
      addressForQuota("::ffff:10.0.0.8", "::ffff:203.0.113.9, 10.0.0.1", ["10.0.0.8"]),
    ).toBe("203.0.113.9");
  });

  it("rejects a missing or short production secret without repeating the value", () => {
    const shortSecret = "short-csrf-secret-value";
    const missingCsrf = productionEnv();
    delete missingCsrf.BINTU_CSRF_SECRET;
    expect(messageOf(missingCsrf)).toBe("BINTU_CSRF_SECRET is required in production");

    const shortCsrf = messageOf(productionEnv({ BINTU_CSRF_SECRET: shortSecret }));
    expect(shortCsrf).toBe("BINTU_CSRF_SECRET must be at least 32 bytes");
    expect(shortCsrf).not.toContain(shortSecret);

    const missingSession = productionEnv();
    delete missingSession.BINTU_SESSION_SECRET;
    expect(messageOf(missingSession)).toBe("BINTU_SESSION_SECRET is required in production");

    const shortSession = "short-session-secret";
    const sessionMessage = messageOf(productionEnv({ BINTU_SESSION_SECRET: shortSession }));
    expect(sessionMessage).toBe("BINTU_SESSION_SECRET must be at least 32 bytes");
    expect(sessionMessage).not.toContain(shortSession);

    const missingMemory = productionEnv();
    delete missingMemory.BINTU_ARGON2_MEMORY_KIB;
    expect(messageOf(missingMemory)).toBe("BINTU_ARGON2_MEMORY_KIB is required in production");

    const lowMemory = messageOf(productionEnv({ BINTU_ARGON2_MEMORY_KIB: "19455" }));
    expect(lowMemory).toBe("BINTU_ARGON2_MEMORY_KIB is below the production minimum");
    expect(lowMemory).not.toContain("19455");

    const invalidTime = messageOf(productionEnv({ BINTU_ARGON2_TIME_COST: "nope" }));
    expect(invalidTime).toBe("BINTU_ARGON2_TIME_COST is below the production minimum");
    expect(invalidTime).not.toContain("nope");

    const missingLanes = productionEnv();
    delete missingLanes.BINTU_ARGON2_PARALLELISM;
    expect(messageOf(missingLanes)).toBe(
      "BINTU_ARGON2_PARALLELISM is required in production",
    );

    const accepted = readAuthSettings(productionEnv());
    expect(accepted.csrfSecret).toBe(CSRF_SECRET);
    expect(accepted.sessionSecret).toBe(SESSION_SECRET);
    expect(Buffer.byteLength(accepted.csrfSecret, "utf8")).toBeGreaterThanOrEqual(32);
  });

  it("replays auth migrations without touching investigations", () => {
    expect(AUTH_MIGRATIONS.some((migration) => migration.sql.includes("investigations"))).toBe(
      false,
    );
    const directory = mkdtempSync(path.join(tmpdir(), "bintu-migrate-"));
    const filename = path.join(directory, "auth.sqlite3");
    const repository = new SqliteDiagnosticRepository(filename);
    repository.insertRaw({
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
    repository.close();
    const first = new SqliteAuthStore(filename, "2026-06-01T00:00:00.000Z");
    first.close();
    const second = new SqliteAuthStore(filename, "2026-06-02T00:00:00.000Z");
    const probe = new Database(filename);
    try {
      const migrations = probe.prepare("SELECT id, applied_at FROM schema_migrations").all() as {
        id: number;
        applied_at: string;
      }[];
      expect(migrations).toEqual([
        { id: 1, applied_at: "2026-06-01T00:00:00.000Z" },
        { id: 2, applied_at: "2026-06-01T00:00:00.000Z" },
      ]);
      const names = (table: string) =>
        (probe.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
          (column) => column.name,
        );
      expect(names("users")).toEqual([
        "id",
        "email",
        "password_hash",
        "created_at",
        "disabled_at",
      ]);
      expect(names("sessions")).toContain("id_hash");
      expect(names("sessions")).not.toContain("id");
      expect(names("sessions")).not.toContain("csrf_token_hash");
      expect(names("invitations")).toContain("code_hash");
      const legacy = probe
        .prepare(
          "SELECT organization_id FROM investigations WHERE id = 'legacy-without-organization'",
        )
        .get() as { organization_id: string | null };
      expect(legacy.organization_id).toBeNull();
    } finally {
      probe.close();
      second.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
