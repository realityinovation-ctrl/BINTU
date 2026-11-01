import {
  AIProviderError,
  DecisionValidationError,
  InvalidStateTransitionError,
  InvestigationNotFoundError,
  PersistenceError,
  ProviderResponseError,
  ProviderTimeoutError,
  UnsupportedToolError,
} from "../core/errors";

export class HttpError extends Error {
  override name = "HttpError";

  constructor(
    readonly statusCode: number,
    readonly detail: string,
  ) {
    super(detail);
  }
}

export class AuthenticationError extends Error {
  override name = "AuthenticationError";
}

export interface HttpResult {
  status: number;
  body: { detail: string };
}

/** Stable client payloads. The original message, stack and secrets stay internal. */
export function mapError(error: unknown): HttpResult {
  return (
    matchError(error) ??
    matchError(causeOf(error)) ?? {
      status: 500,
      body: { detail: "Unexpected server error" },
    }
  );
}

function causeOf(error: unknown): unknown {
  if (error !== null && typeof error === "object" && "cause" in error) {
    return error.cause;
  }
  return undefined;
}

function matchError(error: unknown): HttpResult | undefined {
  if (error instanceof HttpError) {
    return { status: error.statusCode, body: { detail: error.detail } };
  }
  if (error instanceof InvestigationNotFoundError) {
    return { status: 404, body: { detail: "Investigation not found" } };
  }
  if (error instanceof ProviderTimeoutError) {
    return { status: 504, body: { detail: "AI provider timed out" } };
  }
  if (error instanceof ProviderResponseError) {
    return {
      status: 422,
      body: { detail: "Provider decision rejected by Agent Core" },
    };
  }
  if (error instanceof AIProviderError) {
    return { status: 502, body: { detail: "AI provider unavailable" } };
  }
  if (
    error instanceof DecisionValidationError ||
    error instanceof UnsupportedToolError
  ) {
    return {
      status: 422,
      body: { detail: "Provider decision rejected by Agent Core" },
    };
  }
  if (error instanceof InvalidStateTransitionError) {
    return {
      status: 409,
      body: { detail: "Investigation cannot accept this operation" },
    };
  }
  if (error instanceof PersistenceError) {
    return { status: 500, body: { detail: "Persistence operation failed" } };
  }
  return undefined;
}
