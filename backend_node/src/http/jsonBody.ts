import { z } from "zod";

import { HttpError } from "./errors";

const RELAXED_NUMBER =
  /([:[\],]\s*)(NaN|-Infinity|Infinity)(?=\s*[,}\]])/g;

/** FastAPI accepts NaN and Infinity, then rejects them as non-finite values. */
export function parseRelaxedJson(text: string): unknown {
  const quoted = text.replace(RELAXED_NUMBER, '$1"__BINTU_$2__"');
  return revive(JSON.parse(quoted) as unknown);
}

function revive(value: unknown): unknown {
  if (value === "__BINTU_NaN__") {
    return Number.NaN;
  }
  if (value === "__BINTU_Infinity__") {
    return Number.POSITIVE_INFINITY;
  }
  if (value === "__BINTU_-Infinity__") {
    return Number.NEGATIVE_INFINITY;
  }
  if (Array.isArray(value)) {
    return value.map(revive);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, revive(item)]),
    );
  }
  return value;
}

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }
  const valueError = parsed.error.issues.some(
    (issue) => issue.path.at(-1) === "value",
  );
  throw new HttpError(
    422,
    valueError
      ? "A finite numeric measurement is required"
      : "Invalid request",
  );
}
