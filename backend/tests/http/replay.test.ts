import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DecisionValidationError,
  ProviderConfigurationError,
  ProviderHTTPError,
  ProviderResponseError,
  ProviderTimeoutError,
  ScriptExhaustedError,
} from "../../src/core/errors";
import { parseDecision } from "../../src/core/models";
import type { AIProvider, ProviderCapabilities } from "../../src/core/ports/aiProvider";
import { SqliteDiagnosticRepository } from "../../src/infrastructure/sqliteDiagnosticRepository";
import { buildApp } from "../../src/http/app";
import { TestAuthContext } from "../../src/http/auth";
import type { AuthContext, ImageAnalyzer, Transcriber } from "../../src/http/ports";

const FIXTURE_ROOT = resolve(process.cwd(), "..", "parity", "http");

interface ScriptStep {
  decision?: unknown;
  error?: string;
  detail?: string;
}

interface FixtureFile {
  field: string;
  filename: string;
  content_type: string;
  file?: string;
  fill_bytes?: number;
  wav?: {
    channels: number;
    sample_width: number;
    rate: number;
    seconds: number;
  };
}

interface FixtureAuth {
  kind: string;
  user_id?: string;
  organization_id?: string | null;
  role?: string | null;
  permissions?: string[];
}

interface Fixture {
  id: string;
  provider: { repeat?: boolean; steps: ScriptStep[] };
  transcriber: ScriptStep & { transcription?: string } | null;
  analyzer: (ScriptStep & { description?: string; certainty?: number }) | null;
  forbidden: string[];
  steps: Array<{
    auth: FixtureAuth;
    request: {
      method: string;
      path: string;
      headers?: Record<string, string>;
      body?: unknown;
      body_raw?: string;
      file?: FixtureFile;
    };
    expect: {
      status: number;
      headers: Record<string, string>;
      body: unknown;
    };
  }>;
}

const CAPABILITIES: ProviderCapabilities = {
  reasoning_structured: true,
  vision: true,
  asr_streaming: false,
  tts: false,
  native_live: false,
};

class ScriptedProvider implements AIProvider {
  private index = 0;

  constructor(
    private readonly steps: ScriptStep[],
    private readonly repeat: boolean,
  ) {}

  decideNext(): ReturnType<AIProvider["decideNext"]> {
    const step = this.take();
    if (step.error !== undefined) {
      throw scriptedError(step.error, step.detail ?? "scripted");
    }
    return parseDecision(step.decision);
  }

  capabilities(): ProviderCapabilities {
    return CAPABILITIES;
  }

  private take(): ScriptStep {
    if (this.index < this.steps.length) {
      const step = this.steps[this.index];
      this.index += 1;
      if (step === undefined) {
        throw new ScriptExhaustedError("script exhausted");
      }
      return step;
    }
    if (this.repeat && this.steps.length > 0) {
      const step = this.steps[this.steps.length - 1];
      if (step === undefined) {
        throw new ScriptExhaustedError("script exhausted");
      }
      return step;
    }
    throw new ScriptExhaustedError("script exhausted");
  }
}

class ScriptedTranscriber implements Transcriber {
  constructor(private readonly script: Fixture["transcriber"]) {}

  transcribe(audio: Buffer, filename: string): string {
    void audio;
    void filename;
    const script = this.script;
    if (script === null) {
      throw new ScriptExhaustedError("transcriber was not scripted");
    }
    if (script.error !== undefined) {
      throw scriptedError(script.error, script.detail ?? "scripted");
    }
    return script.transcription ?? "";
  }
}

class ScriptedAnalyzer implements ImageAnalyzer {
  constructor(private readonly script: Fixture["analyzer"]) {}

  analyze(content: Buffer, contentType: string, focus: string) {
    void content;
    void contentType;
    void focus;
    const script = this.script;
    if (script === null) {
      throw new ScriptExhaustedError("analyzer was not scripted");
    }
    if (script.error !== undefined) {
      throw scriptedError(script.error, script.detail ?? "scripted");
    }
    return {
      description: script.description ?? "",
      certainty: script.certainty ?? 0,
    };
  }
}

function scriptedError(kind: string, detail: string): Error {
  switch (kind) {
    case "http":
      return new ProviderHTTPError(detail);
    case "timeout":
      return new ProviderTimeoutError(detail);
    case "response":
      return new ProviderResponseError(detail);
    case "configuration":
      return new ProviderConfigurationError(detail);
    case "validation":
      return new DecisionValidationError(detail);
    case "exhausted":
      return new ScriptExhaustedError(detail);
    default:
      return new Error(detail);
  }
}

function createSequence(): { newId: () => string; now: () => string } {
  let ids = 0;
  let ticks = 0;
  return {
    newId() {
      ids += 1;
      const hex = ids.toString(16).padStart(32, "0");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
    now() {
      ticks += 1;
      const minutes = String(Math.floor(ticks / 60)).padStart(2, "0");
      const seconds = String(ticks % 60).padStart(2, "0");
      return `2026-01-01T00:${minutes}:${seconds}.000000+00:00`;
    },
  };
}

function loadFixtures(): Fixture[] {
  const paths: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith(".json")) {
        paths.push(path);
      }
    }
  };
  walk(FIXTURE_ROOT);
  return paths
    .sort()
    .map((path) => JSON.parse(readFileSync(path, "utf8")) as Fixture);
}

function materialize(recipe: FixtureFile): Buffer {
  if (recipe.file !== undefined) {
    return readFileSync(join(FIXTURE_ROOT, recipe.file));
  }
  if (recipe.fill_bytes !== undefined) {
    return Buffer.alloc(recipe.fill_bytes);
  }
  if (recipe.wav !== undefined) {
    return buildWav(recipe.wav);
  }
  throw new Error("file recipe is empty");
}

function buildWav(options: NonNullable<FixtureFile["wav"]>): Buffer {
  const frameCount = Math.floor(options.rate * options.seconds);
  const data = Buffer.alloc(frameCount * options.channels * options.sample_width);
  const bits = options.sample_width * 8;
  const blockAlign = options.channels * options.sample_width;
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(options.channels, 2);
  fmt.writeUInt32LE(options.rate, 4);
  fmt.writeUInt32LE(options.rate * blockAlign, 8);
  fmt.writeUInt16LE(blockAlign, 12);
  fmt.writeUInt16LE(bits, 14);
  const fmtChunk = Buffer.concat([
    Buffer.from("fmt "),
    uint32(16),
    fmt,
  ]);
  const dataChunk = Buffer.concat([
    Buffer.from("data"),
    uint32(data.length),
    data,
  ]);
  const body = Buffer.concat([Buffer.from("WAVE"), fmtChunk, dataChunk]);
  return Buffer.concat([Buffer.from("RIFF"), uint32(body.length), body]);
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function multipart(recipe: FixtureFile, bytes: Buffer): {
  payload: Buffer;
  contentType: string;
} {
  const boundary = "----bintufixture";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${recipe.field}"; filename="${recipe.filename}"\r\nContent-Type: ${recipe.content_type}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    payload: Buffer.concat([head, bytes, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function authContext(auth: FixtureAuth): AuthContext | null {
  if (auth.kind === "anonymous") {
    return null;
  }
  return {
    userId: auth.user_id ?? "",
    organizationId: auth.organization_id ?? null,
    role: auth.role ?? null,
    permissions: auth.permissions ?? [],
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

const fixtures = loadFixtures();

describe("http fixtures", () => {
  it("replays every frozen FastAPI response, including non-finite measurements", () => {
    const names = fixtures.map((fixture) => fixture.id);
    expect(names).toContain("message/non_finite_value");
    expect(names).toContain("measurement/non_finite_body");
    expect(fixtures.length).toBeGreaterThanOrEqual(54);
  });

  for (const fixture of fixtures) {
    it(fixture.id, async () => {
      const sequence = createSequence();
      const repository = new SqliteDiagnosticRepository(":memory:", sequence);
      const auth = new TestAuthContext(null);
      const app = await buildApp({
        repository,
        provider: new ScriptedProvider(
          fixture.provider.steps,
          fixture.provider.repeat === true,
        ),
        transcriber: new ScriptedTranscriber(fixture.transcriber),
        imageAnalyzer: new ScriptedAnalyzer(fixture.analyzer),
        auth,
        newId: sequence.newId,
      });
      try {
        for (const [index, step] of fixture.steps.entries()) {
          auth.context = authContext(step.auth);
          const headers: Record<string, string> = {
            ...(step.request.headers ?? {}),
          };
          let payload: string | Buffer | undefined;
          if (step.request.file !== undefined) {
            const encoded = multipart(
              step.request.file,
              materialize(step.request.file),
            );
            payload = encoded.payload;
            headers["content-type"] = encoded.contentType;
          } else if (step.request.body_raw !== undefined) {
            payload = step.request.body_raw;
          } else if (step.request.body !== undefined) {
            payload = JSON.stringify(step.request.body);
          }
          const response = await app.inject({
            method: step.request.method as "GET" | "POST",
            url: step.request.path,
            headers,
            payload,
          });
          const label = `${fixture.id} step ${index}`;
          expect(response.statusCode, label).toBe(step.expect.status);
          expect(response.headers["content-type"], label).toBe(
            step.expect.headers["content-type"],
          );
          expect(canonical(JSON.parse(response.body)), label).toEqual(
            canonical(step.expect.body),
          );
          for (const secret of fixture.forbidden) {
            expect(response.body, label).not.toContain(secret);
          }
        }
      } finally {
        await app.close();
        repository.close();
      }
    }, 120_000);
  }
});
