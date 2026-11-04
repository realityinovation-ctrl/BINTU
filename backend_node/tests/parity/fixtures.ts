import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_ROOT = path.resolve(here, "../../../parity/fixtures");

/** Replayed when the HTTP routes exist. The core never sees this body. */
export const DEFERRED_HTTP_FIXTURES = ["measurement/non_finite_value.json"] as const;

export interface Fixture {
  id: string;
  category: string;
  operation: string;
  input_state: Record<string, unknown>;
  decision: unknown;
  submission: Record<string, unknown> | null;
  expected: {
    state?: unknown;
    error?: { type: string; message: string; status_code?: number };
  };
  invariants: {
    step_count: number;
    hypotheses: unknown;
    evidence: unknown;
    timeline: unknown;
  } | null;
}

export function listFixtures(): string[] {
  const files: string[] = [];
  for (const category of readdirSync(FIXTURE_ROOT, { withFileTypes: true })) {
    if (!category.isDirectory()) {
      continue;
    }
    for (const file of readdirSync(path.join(FIXTURE_ROOT, category.name))) {
      if (file.endsWith(".json")) {
        files.push(`${category.name}/${file}`);
      }
    }
  }
  return files.sort();
}

export function loadFixture(relative: string): Fixture {
  const text = readFileSync(path.join(FIXTURE_ROOT, relative), "utf8");
  return JSON.parse(text) as Fixture;
}

export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return Object.fromEntries(entries.map(([key, item]) => [key, sortKeys(item)]));
  }
  return value;
}
