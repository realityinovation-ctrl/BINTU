"""Public errors raised by BINTU Agent Core."""


class AgentCoreError(Exception):
    """Base class for controlled Agent Core failures."""


class DecisionValidationError(AgentCoreError):
    """A provider decision violates the contract or a business rule."""


class InvalidStateTransitionError(AgentCoreError):
    """An operation is not allowed from the current investigation state."""


class SafetyViolationError(DecisionValidationError):
    """A proposed action violates an electrical safety rule."""


class ScriptExhaustedError(AgentCoreError):
    """A deterministic mock provider has no decision left."""


class UnsupportedToolError(AgentCoreError):
    """A valid contract tool is not executable in this core version."""
