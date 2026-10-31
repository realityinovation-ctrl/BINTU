/** Controlled failures of the diagnostic core. Names match the Python reference. */

export class AgentCoreError extends Error {
  override name = "AgentCoreError";
}

export class DecisionValidationError extends AgentCoreError {
  override name = "DecisionValidationError";
}

export class InvalidStateTransitionError extends AgentCoreError {
  override name = "InvalidStateTransitionError";
}

export class SafetyViolationError extends DecisionValidationError {
  override name = "SafetyViolationError";
}

export class ScriptExhaustedError extends AgentCoreError {
  override name = "ScriptExhaustedError";
}

export class UnsupportedToolError extends AgentCoreError {
  override name = "UnsupportedToolError";
}

export class AIProviderError extends AgentCoreError {
  override name = "AIProviderError";
}

export class ProviderConfigurationError extends AIProviderError {
  override name = "ProviderConfigurationError";
}

export class ProviderHTTPError extends AIProviderError {
  override name = "ProviderHTTPError";
}

export class ProviderTimeoutError extends AIProviderError {
  override name = "ProviderTimeoutError";
}

export class ProviderResponseError extends AIProviderError {
  override name = "ProviderResponseError";
}

export class PersistenceError extends AgentCoreError {
  override name = "PersistenceError";
}

export class InvestigationNotFoundError extends PersistenceError {
  override name = "InvestigationNotFoundError";
}

export class StateCorruptionError extends PersistenceError {
  override name = "StateCorruptionError";
}
