import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import {
  InvestigationNotFoundError,
  PersistenceError,
  ProviderResponseError,
} from "../../src/core/errors";
import { parseDecision, parseState } from "../../src/core/models";
import type { AIProvider, ProviderCapabilities } from "../../src/core/ports/aiProvider";
import type { DiagnosticRepository } from "../../src/core/ports/diagnosticRepository";
import {
  createInvestigation,
  SqliteDiagnosticRepository,
} from "../../src/infrastructure/sqliteDiagnosticRepository";
import { buildApp } from "../../src/http/app";
import { TestAuthContext, requirePermission } from "../../src/http/auth";
import { validateWav } from "../../src/http/audio";
import { clientAddress } from "../../src/http/clientAddress";
import { readCookie } from "../../src/http/cookies";
import { mapError } from "../../src/http/errors";
import { validateImage } from "../../src/http/images";
import { parseRelaxedJson } from "../../src/http/jsonBody";
import { headerText } from "../../src/http/origin";
import type { AuthContext } from "../../src/http/ports";
import { presentInvestigation } from "../../src/http/present";
import { SlidingRateLimiter } from "../../src/http/rateLimit";

const capabilities: ProviderCapabilities = {
  reasoning_structured: true,
  vision: true,
  asr_streaming: false,
  tts: false,
  native_live: false,
};

const operator: AuthContext = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin",
  permissions: [
    "diagnostic:create",
    "diagnostic:operate",
    "diagnostic:read",
    "organization:manage",
  ],
};

class MeasureProvider implements AIProvider {
  decideNext(): ReturnType<AIProvider["decideNext"]> {
    return parseDecision({
      tool_name: "request_measurement",
      reason: "Mesurer la tension.",
      arguments: {
        measurement_type: "dc_voltage",
        unit: "V",
        location: "string",
        distinguishes: ["H0", "H1"],
      },
    });
  }

  capabilities(): ProviderCapabilities {
    return capabilities;
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
    return capabilities;
  }
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

describe("http boundaries", { timeout: 30_000 }, () => {
  it("keeps malformed cookies, array headers, and an empty peer on their safe paths", () => {
    expect(readCookie("bintu_session", "bintu_session")).toBeUndefined();
    expect(readCookie("other=value", "bintu_session")).toBeUndefined();
    expect(headerText(["http://localhost:5173"])).toBeUndefined();
    const request = {
      socket: { remoteAddress: "" },
      ip: "198.51.100.8",
      headers: { "x-forwarded-for": "203.0.113.50" },
    } as unknown as FastifyRequest;
    expect(clientAddress(request, ["203.0.113.50"])).toBe("198.51.100.8");
  });

  it("stays blocked until the block window has elapsed", () => {
    let now = 0;
    const limiter = new SlidingRateLimiter(
      { max: 1, windowMs: 5_000, blockMs: 5_000 },
      () => now,
    );
    expect(limiter.allow("register-ip:192.0.2.5")).toBe(true);
    expect(limiter.allow("register-ip:192.0.2.5")).toBe(false);
    expect(limiter.allow("register-ip:192.0.2.5")).toBe(false);
    now += 5_000;
    expect(limiter.allow("register-ip:192.0.2.5")).toBe(true);
  });

  it("maps persistence and provider failures, including a wrapped cause", () => {
    expect(mapError(new PersistenceError("failed to save investigation"))).toEqual({
      status: 500,
      body: { detail: "Persistence operation failed" },
    });
    expect(mapError(new ProviderResponseError("rejected"))).toEqual({
      status: 422,
      body: { detail: "Provider decision rejected by Agent Core" },
    });
    expect(
      mapError({ cause: new InvestigationNotFoundError("investigation not found: gone") }),
    ).toEqual({
      status: 404,
      body: { detail: "Investigation not found" },
    });
    expect(() =>
      requirePermission(
        {
          authenticate() {
            throw new Error("store unavailable");
          },
        },
        "diagnostic:read",
      ),
    ).toThrow("store unavailable");
  });

  it("rejects a non-finite text measurement and a measurement that was not requested", async () => {
    const measured = await buildApp({
      repository: new SqliteDiagnosticRepository(":memory:"),
      provider: new MeasureProvider(),
      transcriber: { transcribe: () => "unused" },
      imageAnalyzer: {
        analyze: () => ({ description: "unused", certainty: 0 }),
      },
      auth: new TestAuthContext(operator),
      newId: () => "00000000-0000-4000-8000-000000000001",
    });
    const asked = await buildApp({
      repository: new SqliteDiagnosticRepository(":memory:"),
      provider: new AskProvider(),
      transcriber: { transcribe: () => "unused" },
      imageAnalyzer: {
        analyze: () => ({ description: "unused", certainty: 0 }),
      },
      auth: new TestAuthContext(operator),
      newId: () => "00000000-0000-4000-8000-000000000002",
    });
    try {
      const created = await measured.inject({
        method: "POST",
        url: "/api/investigations",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ problem: "La tension est absente." }),
      });
      const createdBody = JSON.parse(created.body) as { investigation_id: string };
      const overflow = await measured.inject({
        method: "POST",
        url: `/api/investigations/${createdBody.investigation_id}/message`,
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ message: "1e309" }),
      });
      expect(overflow.statusCode).toBe(422);
      expect(JSON.parse(overflow.body)).toEqual({
        detail: "A finite numeric measurement is required",
      });

      const waiting = await asked.inject({
        method: "POST",
        url: "/api/investigations",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ problem: "Le voyant reste éteint." }),
      });
      const waitingBody = JSON.parse(waiting.body) as { investigation_id: string };
      const early = await asked.inject({
        method: "POST",
        url: `/api/investigations/${waitingBody.investigation_id}/measurement`,
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({
          measurement_type: "dc_voltage",
          value: 12,
          unit: "V",
          location: "string",
        }),
      });
      expect(early.statusCode).toBe(409);
      expect(JSON.parse(early.body)).toEqual({
        detail: "Investigation cannot accept this operation",
      });
    } finally {
      await measured.close();
      await asked.close();
    }
  });

  it("omits an investigation that disappears while the list is read", async () => {
    const repository = new SqliteDiagnosticRepository(":memory:");
    const state = repository.create("org-1", "user-1");
    const disappearing: DiagnosticRepository = {
      create: (organizationId, userId) => repository.create(organizationId, userId),
      save: (item, organizationId) => repository.save(item, organizationId),
      delete: (id, organizationId) => repository.delete(id, organizationId),
      list: (organizationId, limit) => repository.list(organizationId, limit),
      get(id) {
        throw new InvestigationNotFoundError(`investigation not found: ${id}`);
      },
    };
    const app = await buildApp({
      repository: disappearing,
      provider: new AskProvider(),
      transcriber: { transcribe: () => "unused" },
      imageAnalyzer: {
        analyze: () => ({ description: "unused", certainty: 0 }),
      },
      auth: new TestAuthContext(operator),
      newId: () => "00000000-0000-4000-8000-000000000003",
    });
    try {
      const listed = await app.inject({ method: "GET", url: "/api/investigations" });
      expect(listed.statusCode).toBe(200);
      expect(JSON.parse(listed.body)).toEqual([]);
      expect(state.investigation_id).not.toBe("");
    } finally {
      await app.close();
      repository.close();
    }
  });

  it("leaves an unexpected list failure unchanged for the error handler", async () => {
    const repository = new SqliteDiagnosticRepository(":memory:");
    repository.create("org-1", "user-1");
    const failing: DiagnosticRepository = {
      create: (organizationId, userId) => repository.create(organizationId, userId),
      save: (item, organizationId) => repository.save(item, organizationId),
      delete: (id, organizationId) => repository.delete(id, organizationId),
      list: () => {
        throw new Error("store unavailable");
      },
      get: (id, organizationId) => repository.get(id, organizationId),
    };
    const app = await buildApp({
      repository: failing,
      provider: new AskProvider(),
      transcriber: { transcribe: () => "unused" },
      imageAnalyzer: {
        analyze: () => ({ description: "unused", certainty: 0 }),
      },
      auth: new TestAuthContext(operator),
      newId: () => "00000000-0000-4000-8000-000000000004",
    });
    try {
      const listed = await app.inject({ method: "GET", url: "/api/investigations" });
      expect(listed.statusCode).toBe(500);
      expect(JSON.parse(listed.body)).toEqual({ detail: "Unexpected server error" });
    } finally {
      await app.close();
      repository.close();
    }
  });

  it("rejects JSON the parser cannot read and values the snapshot can represent", async () => {
    const logs: string[] = [];
    const app = await buildApp({
      repository: new SqliteDiagnosticRepository(":memory:"),
      provider: new AskProvider(),
      transcriber: { transcribe: () => "unused" },
      imageAnalyzer: {
        analyze: () => ({ description: "unused", certainty: 0 }),
      },
      auth: new TestAuthContext(operator),
      newId: () => "00000000-0000-4000-8000-000000000005",
      logStream: { write: (chunk) => logs.push(chunk) },
    });
    try {
      const broken = await app.inject({
        method: "POST",
        url: "/api/investigations",
        headers: { "content-type": "application/json" },
        payload: "{",
      });
      expect(broken.statusCode).toBe(500);
      expect(JSON.parse(broken.body)).toEqual({ detail: "Unexpected server error" });
      expect(parseRelaxedJson("[-Infinity,1]")).toEqual([Number.NEGATIVE_INFINITY, 1]);
      expect(logs.some((line) => line.includes("Unexpected server error"))).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("rejects audio and images that do not match the accepted formats", () => {
    const truncated = Buffer.concat([
      Buffer.from("RIFF"),
      uint32(20),
      Buffer.from("WAVE"),
      Buffer.from("fmt "),
      uint32(40),
      Buffer.alloc(4),
    ]);
    const shortFmt = Buffer.concat([
      Buffer.from("RIFF"),
      uint32(4 + 8 + 8),
      Buffer.from("WAVE"),
      Buffer.from("fmt "),
      uint32(8),
      Buffer.alloc(8),
    ]);
    const fmt = Buffer.alloc(16);
    fmt.writeUInt16LE(1, 0);
    fmt.writeUInt16LE(1, 2);
    fmt.writeUInt32LE(0, 4);
    fmt.writeUInt16LE(2, 12);
    fmt.writeUInt16LE(16, 14);
    const silentRate = Buffer.concat([
      Buffer.from("RIFF"),
      uint32(4 + 8 + 16 + 8),
      Buffer.from("WAVE"),
      Buffer.from("fmt "),
      uint32(16),
      fmt,
      Buffer.from("data"),
      uint32(0),
    ]);
    expect(() => validateWav(truncated)).toThrow("Audio is not a valid WAV file");
    expect(() => validateWav(shortFmt)).toThrow("Audio is not a valid WAV file");
    expect(() => validateWav(silentRate)).toThrow("Audio is not a valid WAV file");
    expect(() => validateImage(Buffer.from([0xff, 0xd8, 0xff, 0xff, 0xd9]), "image/gif")).toThrow(
      "Image content does not match its declared format",
    );
  });

  it("shows a pending proposal and hides an empty pending action", () => {
    const idle = createInvestigation("inv-idle");
    expect(presentInvestigation(idle).state.pending_action).toBeNull();
    const proposed = parseState({
      ...idle,
      investigation_id: "inv-proposed",
      pending_action: {
        action_id: "action-1",
        decision: {
          tool_name: "ask_technician",
          reason: "Obtenir une observation.",
          arguments: {
            question: "Quel état est affiché ?",
            distinguishes: ["H0"],
          },
          hypothesis_updates: [
            {
              hypothesis_id: "H0",
              relation: "supporting",
              strength: "indicative",
              status: "plausible",
              evidence_ids: ["evidence-1"],
              reason: "Le voyant est allumé.",
            },
          ],
        },
      },
    });
    const pending = presentInvestigation(proposed).state.pending_action as {
      hypothesis_updates?: { hypothesis_id: string }[];
    };
    expect(pending.hypothesis_updates?.[0]?.hypothesis_id).toBe("H0");
  });
});
