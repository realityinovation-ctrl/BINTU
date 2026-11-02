import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { readAuthSettings } from "../../src/auth/config";
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

describe("auth primitives", () => {
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
    expect(readAuthSettings({ BINTU_ENV: "production" }).allowedOrigins).toEqual([]);
    expect(readAuthSettings({ BINTU_ARGON2_MEMORY_KIB: "nope" }).argon2.memoryCost).toBe(
      PRODUCTION_ARGON2.memoryCost,
    );
    expect(
      readAuthSettings({ BINTU_ALLOWED_ORIGINS: "http://localhost:5173, http://127.0.0.1:5173" })
        .allowedOrigins,
    ).toEqual(["http://localhost:5173", "http://127.0.0.1:5173"]);
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
