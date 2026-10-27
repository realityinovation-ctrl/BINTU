"""AI provider boundary and deterministic test double."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any, Protocol

from bintu_agent_core.errors import ScriptExhaustedError
from bintu_agent_core.models import AgentDecision, InvestigationState


class AIProvider(Protocol):
    def decide_next(self, state: InvestigationState) -> AgentDecision:
        """Return one provider-neutral decision for the current state."""


class MockAIProvider:
    """Replay scripted decisions without network access or diagnostic logic."""

    def __init__(
        self, decisions: Iterable[AgentDecision | dict[str, Any]]
    ) -> None:
        self._decisions = [
            decision
            if isinstance(decision, AgentDecision)
            else AgentDecision.model_validate(decision)
            for decision in decisions
        ]
        self._index = 0

    @property
    def remaining(self) -> int:
        return len(self._decisions) - self._index

    def decide_next(self, state: InvestigationState) -> AgentDecision:
        del state
        if self._index >= len(self._decisions):
            raise ScriptExhaustedError("mock decision script is exhausted")
        decision = self._decisions[self._index]
        self._index += 1
        return decision.model_copy(deep=True)
