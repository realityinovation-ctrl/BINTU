"""In-memory investigation loop for BINTU Agent Core."""

from __future__ import annotations

from bintu_agent_core.errors import (
    DecisionValidationError,
    InvalidStateTransitionError,
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
    EvidenceStrength,
    EvidenceSourceType,
    FinishInvestigationArguments,
    FinishOutcome,
    GenerateReportArguments,
    HypothesisImpact,
    HypothesisUpdate,
    HypothesisStatus,
    InvestigationState,
    InvestigationStatus,
    Measurement,
    Observation,
    PendingAction,
    RequestMeasurementArguments,
    TimelineEvent,
    TimelineEventType,
    Verification,
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

        decision = self.provider.decide_next(self.state.model_copy(deep=True))

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
        self._apply_hypothesis_updates(action_id, decision.hypothesis_updates)
        self._dispatch(action_id, decision)
        return self.state

    def submit_technician_answer(
        self,
        evidence_id: str,
        answer: str,
        impacts: list[HypothesisImpact] | None = None,
    ) -> InvestigationState:
        pending = self._require_pending(AskTechnicianArguments)
        if not answer.strip():
            raise DecisionValidationError("technician answer must not be blank")
        observation = Observation(
            id=f"observation:{evidence_id}",
            source_type=EvidenceSourceType.TECHNICIAN_ANSWER,
            source_id=pending.action_id,
            statement=answer,
        )
        self._record_tool_result(
            pending, evidence_id, observation, impacts or []
        )
        self._resume(pending.action_id)
        return self.state

    def submit_measurement(
        self,
        measurement_id: str,
        value: float,
        impacts: list[HypothesisImpact] | None = None,
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
        observation = Observation(
            id=f"observation:{measurement_id}",
            source_type=EvidenceSourceType.MEASUREMENT,
            source_id=measurement_id,
            statement=f"{arguments.measurement_type} mesurée à {arguments.location}",
            value=value,
            unit=arguments.unit,
        )
        self._record_tool_result(
            pending, measurement_id, observation, impacts or []
        )
        self.state.measurements[measurement_id] = measurement
        self._resume(pending.action_id)
        return self.state

    def submit_image_analysis(
        self,
        evidence_id: str,
        statement: str,
        certainty: float,
        impacts: list[HypothesisImpact] | None = None,
    ) -> InvestigationState:
        pending = self._require_pending(AnalyzeImageArguments)
        arguments = pending.decision.arguments
        assert isinstance(arguments, AnalyzeImageArguments)
        observation = Observation(
            id=f"observation:{evidence_id}",
            source_type=EvidenceSourceType.IMAGE_ANALYSIS,
            source_id=arguments.image_id,
            statement=statement,
            certainty=certainty,
        )
        self._record_tool_result(
            pending, evidence_id, observation, impacts or []
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
            self._compare_measurements(action_id, decision, arguments)
            return
        if isinstance(arguments, FinishInvestigationArguments):
            self._finish(arguments)
            return
        raise UnsupportedToolError(f"unsupported tool: {decision.tool_name.value}")

    def apply_verification_impacts(
        self, verification_id: str, impacts: list[HypothesisImpact]
    ) -> InvestigationState:
        if self.state.status is not InvestigationStatus.INVESTIGATING:
            raise InvalidStateTransitionError(
                "verification impacts require an active investigation"
            )
        if not impacts:
            raise DecisionValidationError("at least one impact is required")
        verification = self.state.verifications.get(verification_id)
        if verification is None:
            raise DecisionValidationError(
                f"unknown verification: {verification_id}"
            )
        if verification.impacts:
            raise DecisionValidationError(
                f"verification impacts already applied: {verification_id}"
            )
        unknown_evidence = set(verification.evidence_ids) - set(self.state.evidence)
        if unknown_evidence:
            raise DecisionValidationError(
                "verification references unknown evidence: "
                f"{sorted(unknown_evidence)}"
            )
        unknown_observations = set(verification.observation_ids) - set(
            self.state.observations
        )
        if unknown_observations:
            raise DecisionValidationError(
                "verification references unknown observations: "
                f"{sorted(unknown_observations)}"
            )
        self._validate_impacts(verification, impacts)
        updated = verification.model_copy(deep=True)
        updated.impacts = list(impacts)
        self.state.verifications[verification_id] = updated
        self._event(
            TimelineEventType.VERIFICATION_RECORDED,
            "Impacts de vérification validés par le cœur.",
            {
                "verification_id": verification_id,
                "hypothesis_ids": [
                    impact.hypothesis_id.value for impact in impacts
                ],
            },
        )
        self._apply_impacts(updated)
        return self.state

    def _compare_measurements(
        self,
        action_id: str,
        decision: AgentDecision,
        arguments: CompareMeasurementsArguments,
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
        observation = Observation(
            id=f"observation:{evidence_id}",
            source_type=EvidenceSourceType.OBSERVATION,
            source_id=action_id,
            statement=f"Comparaison factuelle : {details}",
            value=max(values) - min(values),
            unit=unit,
        )
        self._record_tool_result(
            PendingAction(action_id=action_id, decision=decision),
            evidence_id,
            observation,
            [],
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

    def _record_tool_result(
        self,
        action: PendingAction,
        evidence_id: str,
        observation: Observation,
        impacts: list[HypothesisImpact],
    ) -> None:
        verification_id = f"verification:{action.action_id}"
        if observation.id in self.state.observations:
            raise DecisionValidationError(
                f"observation already exists: {observation.id}"
            )
        if evidence_id in self.state.evidence:
            raise DecisionValidationError(f"evidence already exists: {evidence_id}")
        if verification_id in self.state.verifications:
            raise DecisionValidationError(
                f"verification already exists: {verification_id}"
            )
        evidence = Evidence(
            id=evidence_id,
            observation_id=observation.id,
            source_type=observation.source_type,
            source_id=observation.source_id,
            certainty=observation.certainty,
        )
        verification = Verification(
            id=verification_id,
            action_id=action.action_id,
            distinguishes=action.decision.arguments.distinguishes,
            observation_ids=[observation.id],
            evidence_ids=[evidence.id],
            impacts=impacts,
        )
        self._validate_impacts(verification, impacts)

        self.state.observations[observation.id] = observation
        self.state.evidence[evidence.id] = evidence
        self.state.verifications[verification.id] = verification
        self._event(
            TimelineEventType.OBSERVATION_ADDED,
            f"Observation ajoutée depuis {observation.source_type.value}.",
            {
                "observation_id": observation.id,
                "source_type": observation.source_type.value,
                "source_id": observation.source_id,
            },
        )
        self._event(
            TimelineEventType.EVIDENCE_ADDED,
            "Preuve créée par référence à une observation validée.",
            {
                "evidence_id": evidence.id,
                "observation_id": evidence.observation_id,
                "source_type": evidence.source_type.value,
                "source_id": evidence.source_id,
            },
        )
        self._event(
            TimelineEventType.VERIFICATION_RECORDED,
            "Résultat d'outil validé et enregistré.",
            {
                "verification_id": verification.id,
                "action_id": verification.action_id,
                "evidence_ids": verification.evidence_ids,
            },
        )
        self._apply_impacts(verification)

    def _apply_hypothesis_updates(
        self, action_id: str, updates: list[HypothesisUpdate]
    ) -> None:
        for update in updates:
            verification_id = (
                f"hypothesis-update:{action_id}:{update.hypothesis_id.value}"
            )
            observation_ids = [
                self.state.evidence[evidence_id].observation_id
                for evidence_id in update.evidence_ids
            ]
            verification = Verification(
                id=verification_id,
                action_id=action_id,
                distinguishes=[update.hypothesis_id],
                observation_ids=observation_ids,
                evidence_ids=list(update.evidence_ids),
                impacts=[
                    HypothesisImpact(
                        hypothesis_id=update.hypothesis_id,
                        relation=update.relation,
                        strength=update.strength,
                    )
                ],
            )
            self.state.verifications[verification.id] = verification
            self._apply_impacts(verification)

    def _validate_impacts(
        self, verification: Verification, impacts: list[HypothesisImpact]
    ) -> None:
        hypothesis_ids = [impact.hypothesis_id for impact in impacts]
        if len(hypothesis_ids) != len(set(hypothesis_ids)):
            raise DecisionValidationError(
                "a verification cannot impact the same hypothesis twice"
            )
        invalid_ids = set(hypothesis_ids) - set(verification.distinguishes)
        if invalid_ids:
            raise DecisionValidationError(
                "verification impacts hypotheses not listed in distinguishes: "
                f"{sorted(item.value for item in invalid_ids)}"
            )

    def _apply_impacts(self, verification: Verification) -> None:
        for impact in verification.impacts:
            hypothesis = self.state.hypotheses[impact.hypothesis_id]
            previous_status = hypothesis.status
            target_ids = (
                hypothesis.supporting_evidence_ids
                if impact.relation is EvidenceRelation.SUPPORTING
                else hypothesis.contradictory_evidence_ids
            )
            for evidence_id in verification.evidence_ids:
                if evidence_id not in target_ids:
                    target_ids.append(evidence_id)
            hypothesis.status = self._derive_hypothesis_status(
                previous_status, impact
            )
            if previous_status is not hypothesis.status:
                self._event(
                    TimelineEventType.HYPOTHESIS_CHANGED,
                    (
                        f"{impact.hypothesis_id.value}: "
                        f"{previous_status.value} -> {hypothesis.status.value}."
                    ),
                    {
                        "hypothesis_id": impact.hypothesis_id.value,
                        "from": previous_status.value,
                        "to": hypothesis.status.value,
                        "verification_id": verification.id,
                        "evidence_ids": verification.evidence_ids,
                    },
                )

    @staticmethod
    def _derive_hypothesis_status(
        current: HypothesisStatus, impact: HypothesisImpact
    ) -> HypothesisStatus:
        if current is HypothesisStatus.ELIMINATED:
            return current
        if impact.relation is EvidenceRelation.SUPPORTING:
            if impact.strength is EvidenceStrength.STRONG:
                return HypothesisStatus.SUPPORTED
            if current is HypothesisStatus.SUPPORTED:
                return current
            return HypothesisStatus.PLAUSIBLE
        if impact.strength is EvidenceStrength.STRONG:
            return HypothesisStatus.ELIMINATED
        return HypothesisStatus.WEAKENED

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
