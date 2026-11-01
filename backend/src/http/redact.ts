const SENSITIVE_KEYS = new Set([
  "password",
  "code",
  "csrf_token",
  "csrftoken",
  "cookie",
  "set-cookie",
  "authorization",
  "x-csrf-token",
  "bootstrap",
  "bootstrapcode",
  "password_hash",
  "code_hash",
  "id_hash",
  "csrf_token_hash",
]);

/** Drop secrets from structured logs before they reach a stream. */
export function redactStructured(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactStructured);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEYS.has(key.toLowerCase()) ? "[redacted]" : redactStructured(item),
      ]),
    );
  }
  return value;
}

export function redactText(text: string): string {
  return text
    .replace(
      /"(password|code|csrf_token|cookie|authorization|x-csrf-token|bootstrap_code)"\s*:\s*"[^"]*"/gi,
      '"$1":"[redacted]"',
    )
    .replace(/((?:__Host-)?bintu_session)=[^;\s"]+/g, "$1=[redacted]")
    .replace(/(x-csrf-token[:=]\s*)\S+/gi, "$1[redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}
