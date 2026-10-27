"""In-memory investigation loop for BINTU Agent Core."""

from __future__ import annotations

from bintu_agent_core.errors import (
    DecisionValidationError,
    InvalidStateTransitionError,
    ScriptExhaustedError,
    UnsupportedToolError,
)
from bintu_agent_core.models import (
    AgentDecision,
    AnalyzeImageArguments,
    AskTechnicianArguments,
    CompareMeasurementsArguments,
    Conclusion,
    Evidence,
    EvidenceRelation,
    EvidenceSourceType,
    FinishInvestigationArguments,
    FinishOutcome,
    GenerateReportArguments,
    HypothesisStatus,
    InvestigationState,
    InvestigationStatus,
    Measurement,
    PendingAction,
    RequestMeasurementArguments,
    TimelineEvent,
    TimelineEventType,
)
from bintu_agent_core.provider import AIProvider
from bintu_agent_core.validation import validate_decision


TERMINAL_STATUSES = {
    InvestigationStatus.COMPLETED,
    InvestigationStatus.INSUFFICIENT_INFORMATION,
}

STATUS_TRANSITIONS = {
    InvestigationStatus.INVESTIGATING: {
        InvestigationStatus.WAITING_FOR_TECHNICIAN,
        InvestigationStatus.COMPLETED,
        InvestigationStatus.INSUFFICIENT_INFORMATION,
    },
    InvestigationStatus.WAITING_FOR_TECHNICIAN: {
        InvestigationStatus.INVESTIGATING,
    },
    InvestigationStatus.COMPLETED: set(),
    InvestigationStatus.INSUFFICIENT_INFORMATION: set(),
}


class InvestigationEngine:
    def __init__(self, state: InvestigationState, provider: AIProvider) -> None:
        self.state = state
        self.provider = provider

    def advance(self) -> InvestigationState:
        if self.state.status is not InvestigationStatus.INVESTIGATING:
            raise InvalidStateTransitionError(
                f"cannot advance from {self.state.status.value}"
            )
        if self.state.step_count >= self.state.max_steps:
            self._finish_insufficient("Nombre maximal d'étapes atteint.")
            return self.state

        try:
            decision = self.provider.decide_next(self.state.model_copy(deep=True))
        except ScriptExhaustedError:
            self._finish_insufficient(
                "Le fournisseur n'a proposé aucune action supplémentaire."
            )
            return self.state

        validate_decision(self.state, decision)
        if isinstance(decision.arguments, GenerateReportArguments):
            raise UnsupportedToolError(
                "generate_report is contracted but deferred in Agent Core v0.2"
            )
        self.state.step_count += 1
        action_id = f"action-{self.state.step_count}"
        self._event(
            TimelineEventType.DECISION_RECORDED,
            decision.reason,
            {
                "action_id": action_id,
                "tool_name": decision.tool_name.value,
                "distinguishes": [
                    hypothesis_id.value
                    for hypothesis_id in decision.arguments.distinguishes
                ],
            },
        )
        self._apply_hypothesis_updates(decision)
        self._dispatch(action_id, decision)
        return self.state

    def submit_technician_answer(
        self, evidence_id: str, answer: str
    ) -> InvestigationState:
        pending = self._require_pending(AskTechnicianArguments)
        if not answer.strip():
            raise DecisionValidationError("technician answer must not be blank")
        self._add_evidence(
            Evidence(
                id=evidence_id,
                source_type=EvidenceSourceType.TECHNICIAN_ANSWER,
                source_id=pending.action_id,
                statement=answer,
            )
        )
        self._resume(pending.action_id)
        return self.state

    def submit_measurement(
        self, measurement_id: str, value: float
    ) -> InvestigationState:
        pending = self._require_pending(RequestMeasurementArguments)
        arguments = pending.decision.arguments
        assert isinstance(arguments, RequestMeasurementArguments)
        if measurement_id in self.state.measurements:
            raise DecisionValidationError(
                f"measurement already exists: {measurement_id}"
            )
        measurement = Measurement(
            id=measurement_id,
            measurement_type=arguments.measurement_type,
            location=arguments.location,
            value=value,
            unit=arguments.unit,
            source_id=pending.action_id,
        )
        self.state.measurements[measurement_id] = measurement
        self._add_evidence(
            Evidence(
                id=measurement_id,
                source_type=EvidenceSourceType.MEASUREMENT,
                source_id=measurement_id,
                statement=(
                    f"{arguments.measurement_type} mesurée à {arguments.location}"
                ),
                value=value,
                unit=arguments.unit,
            )
        )
        self._resume(pending.action_id)
        return self.state

    def submit_image_analysis(
        self, evidence_id: str, statement: str, certainty: float
    ) -> InvestigationState:
        pending = self._require_pending(AnalyzeImageArguments)
        arguments = pending.decision.arguments
        assert isinstance(arguments, AnalyzeImageArguments)
        self._add_evidence(
            Evidence(
                id=evidence_id,
                source_type=EvidenceSourceType.IMAGE_ANALYSIS,
                source_id=arguments.image_id,
                statement=statement,
                certainty=certainty,
            )
        )
        self._resume(pending.action_id)
        return self.state

    def _dispatch(self, action_id: str, decision: AgentDecision) -> None:
        arguments = decision.arguments
        if isinstance(
            arguments,
            (
                AskTechnicianArguments,
                RequestMeasurementArguments,
                AnalyzeImageArguments,
            ),
        ):
            self.state.pending_action = PendingAction(
                action_id=action_id, decision=decision
            )
            self._event(
                TimelineEventType.ACTION_REQUESTED,
                f"Action externe demandée : {decision.tool_name.value}.",
                {"action_id": action_id},
            )
            self._set_status(InvestigationStatus.WAITING_FOR_TECHNICIAN)
            return
        if isinstance(arguments, CompareMeasurementsArguments):
            self._compare_measurements(action_id, arguments)
            return
        if isinstance(arguments, FinishInvestigationArguments):
            self._finish(arguments)
            return
        raise UnsupportedToolError(f"unsupported tool: {decision.tool_name.value}")

    def _apply_hypothesis_updates(self, decision: AgentDecision) -> None:
        for update in decision.arguments.hypothesis_updates:
            hypothesis = self.state.hypotheses[update.hypothesis_id]
            previous_status = hypothesis.status
            if update.evidence_relation is EvidenceRelation.SUPPORTING:
                for evidence_id in update.evidence_ids:
                    if evidence_id not in hypothesis.supporting_evidence_ids:
                        hypothesis.supporting_evidence_ids.append(evidence_id)
            elif update.evidence_relation is EvidenceRelation.CONTRADICTORY:
                for evidence_id in update.evidence_ids:
                    if evidence_id not in hypothesis.contradictory_evidence_ids:
                        hypothesis.contradictory_evidence_ids.append(evidence_id)
            hypothesis.status = update.new_status
            if previous_status is not update.new_status:
                self._event(
                    TimelineEventType.HYPOTHESIS_CHANGED,
                    (
                        f"{update.hypothesis_id.value}: "
                        f"{previous_status.value} -> {update.new_status.value}."
                    ),
                    {
                        "hypothesis_id": update.hypothesis_id.value,
                        "from": previous_status.value,
                        "to": update.new_status.value,
                        "evidence_ids": update.evidence_ids,
                    },
                )

    def _compare_measurements(
        self, action_id: str, arguments: CompareMeasurementsArguments
    ) -> None:
        measurements = [
            self.state.measurements[measurement_id]
            for measurement_id in arguments.measurement_ids
        ]
        values = [measurement.value for measurement in measurements]
        unit = measurements[0].unit
        evidence_id = f"comparison-{self.state.step_count}"
        details = "; ".join(
            f"{measurement.id}={measurement.value:g} {measurement.unit}"
            for measurement in measurements
        )
        self._add_evidence(
            Evidence(
                id=evidence_id,
                source_type=EvidenceSourceType.OBSERVATION,
                source_id=action_id,
                statement=f"Comparaison factuelle : {details}",
                value=max(values) - min(values),
                unit=unit,
            )
        )

    def _finish(self, arguments: FinishInvestigationArguments) -> None:
        if arguments.outcome is FinishOutcome.INSUFFICIENT_INFORMATION:
            self._finish_insufficient(
                "Les preuves disponibles ne permettent pas de conclure."
            )
            return
        assert arguments.diagnosis is not None
        self.state.conclusion = Conclusion(
            diagnosis=arguments.diagnosis,
            confidence=arguments.confidence,
            evidence_ids=arguments.evidence,
            remaining_uncertainties=arguments.remaining_uncertainties,
        )
        self._set_status(InvestigationStatus.COMPLETED)

    def _finish_insufficient(self, summary: str) -> None:
        self.state.conclusion = None
        self._set_status(InvestigationStatus.INSUFFICIENT_INFORMATION, summary)

    def _require_pending(
        self, expected_type: type[AskTechnicianArguments]
        | type[RequestMeasurementArguments]
        | type[AnalyzeImageArguments]
    ) -> PendingAction:
        if self.state.status is not InvestigationStatus.WAITING_FOR_TECHNICIAN:
            raise InvalidStateTransitionError(
                "no technician response is currently expected"
            )
        pending = self.state.pending_action
        if pending is None or not isinstance(
            pending.decision.arguments, expected_type
        ):
            raise InvalidStateTransitionError(
                f"pending action does not accept {expected_type.__name__}"
            )
        return pending

    def _resume(self, action_id: str) -> None:
        self.state.pending_action = None
        self._event(
            TimelineEventType.ACTION_RESUMED,
            "Résultat externe reçu ; l'investigation peut reprendre.",
            {"action_id": action_id},
        )
        self._set_status(InvestigationStatus.INVESTIGATING)

    def _add_evidence(self, evidence: Evidence) -> None:
        if evidence.id in self.state.evidence:
            raise DecisionValidationError(f"evidence already exists: {evidence.id}")
        self.state.evidence[evidence.id] = evidence
        self._event(
            TimelineEventType.EVIDENCE_ADDED,
            f"Preuve factuelle ajoutée depuis {evidence.source_type.value}.",
            {
                "evidence_id": evidence.id,
                "source_type": evidence.source_type.value,
                "source_id": evidence.source_id,
            },
        )

    def _set_status(
        self, new_status: InvestigationStatus, summary: str | None = None
    ) -> None:
        old_status = self.state.status
        if new_status not in STATUS_TRANSITIONS[old_status]:
            raise InvalidStateTransitionError(
                f"invalid status transition: {old_status.value} -> {new_status.value}"
            )
        self.state.status = new_status
        self._event(
            TimelineEventType.STATUS_CHANGED,
            summary or f"Statut : {old_status.value} -> {new_status.value}.",
            {"from": old_status.value, "to": new_status.value},
        )

    def _event(
        self,
        event_type: TimelineEventType,
        summary: str,
        details: dict[str, object] | None = None,
    ) -> None:
        self.state.timeline.append(
            TimelineEvent(
                sequence=len(self.state.timeline) + 1,
                event_type=event_type,
                summary=summary,
                details=details or {},
            )
        )
