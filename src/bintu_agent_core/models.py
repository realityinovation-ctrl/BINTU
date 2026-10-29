"""Provider-neutral Agent Contract v0.2."""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, model_serializer, model_validator


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)


class HypothesisId(StrEnum):
    H0 = "H0"
    H1 = "H1"
    H2 = "H2"
    H3 = "H3"


class HypothesisStatus(StrEnum):
    UNEXPLORED = "unexplored"
    PLAUSIBLE = "plausible"
    SUPPORTED = "supported"
    WEAKENED = "weakened"
    ELIMINATED = "eliminated"


class InvestigationStatus(StrEnum):
    INVESTIGATING = "investigating"
    WAITING_FOR_TECHNICIAN = "waiting_for_technician"
    COMPLETED = "completed"
    INSUFFICIENT_INFORMATION = "insufficient_information"


class EvidenceSourceType(StrEnum):
    OBSERVATION = "observation"
    MEASUREMENT = "measurement"
    TECHNICIAN_ANSWER = "technician_answer"
    IMAGE_ANALYSIS = "image_analysis"


class EvidenceRelation(StrEnum):
    SUPPORTING = "supporting"
    CONTRADICTORY = "contradictory"


class EvidenceStrength(StrEnum):
    INDICATIVE = "indicative"
    STRONG = "strong"


class ToolName(StrEnum):
    ASK_TECHNICIAN = "ask_technician"
    REQUEST_MEASUREMENT = "request_measurement"
    ANALYZE_IMAGE = "analyze_image"
    COMPARE_MEASUREMENTS = "compare_measurements"
    FINISH_INVESTIGATION = "finish_investigation"
    GENERATE_REPORT = "generate_report"


class FinishOutcome(StrEnum):
    DIAGNOSED = "diagnosed"
    INSUFFICIENT_INFORMATION = "insufficient_information"


class TimelineEventType(StrEnum):
    DECISION_RECORDED = "decision_recorded"
    STATUS_CHANGED = "status_changed"
    HYPOTHESIS_CHANGED = "hypothesis_changed"
    OBSERVATION_ADDED = "observation_added"
    VERIFICATION_RECORDED = "verification_recorded"
    EVIDENCE_ADDED = "evidence_added"
    ACTION_REQUESTED = "action_requested"
    ACTION_RESUMED = "action_resumed"


class InstallationData(ContractModel):
    nominal_power_kwp: float | None = None
    panel_count: int | None = None
    inverter_model: str | None = None
    battery_present: bool | None = None
    battery_capacity_kwh: float | None = None
    system_voltage_v: float | None = None


class Problem(ContractModel):
    description: str = Field(min_length=1)


EvidenceValue = str | int | float | bool


class Observation(ContractModel):
    id: str = Field(min_length=1)
    source_type: EvidenceSourceType
    source_id: str = Field(min_length=1)
    statement: str = Field(min_length=1)
    value: EvidenceValue | None = None
    unit: str | None = None
    certainty: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode="after")
    def validate_certainty_origin(self) -> Observation:
        if self.source_type is EvidenceSourceType.IMAGE_ANALYSIS:
            if self.certainty is None:
                raise ValueError("image_analysis observation requires certainty")
        elif self.certainty is not None:
            raise ValueError("certainty is only valid for image_analysis observation")
        return self


class Evidence(ContractModel):
    id: str = Field(min_length=1)
    observation_id: str = Field(min_length=1)
    source_type: EvidenceSourceType
    source_id: str = Field(min_length=1)
    certainty: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode="after")
    def validate_certainty_origin(self) -> Evidence:
        if self.source_type is EvidenceSourceType.IMAGE_ANALYSIS:
            if self.certainty is None:
                raise ValueError("image_analysis evidence requires certainty")
        elif self.certainty is not None:
            raise ValueError("certainty is only valid for image_analysis evidence")
        return self


class Measurement(ContractModel):
    id: str = Field(min_length=1)
    measurement_type: str = Field(min_length=1)
    location: str = Field(min_length=1)
    value: float
    unit: str = Field(min_length=1)
    source_id: str = Field(min_length=1)


class HypothesisState(ContractModel):
    hypothesis_id: HypothesisId
    status: HypothesisStatus = HypothesisStatus.UNEXPLORED
    supporting_evidence_ids: list[str] = Field(default_factory=list)
    contradictory_evidence_ids: list[str] = Field(default_factory=list)


class HypothesisImpact(ContractModel):
    hypothesis_id: HypothesisId
    relation: EvidenceRelation
    strength: EvidenceStrength


class HypothesisUpdate(ContractModel):
    """A provider proposal. The Core alone derives and applies the status."""

    hypothesis_id: HypothesisId
    relation: EvidenceRelation
    strength: EvidenceStrength
    status: HypothesisStatus
    evidence_ids: list[str]
    reason: str = Field(min_length=1)


class ActionArguments(ContractModel):
    distinguishes: Annotated[list[HypothesisId], Field(min_length=1)]


class AskTechnicianArguments(ActionArguments):
    question: str = Field(min_length=1)


class RequestMeasurementArguments(ActionArguments):
    measurement_type: str = Field(min_length=1)
    location: str = Field(min_length=1)
    unit: str = Field(min_length=1)


class AnalyzeImageArguments(ActionArguments):
    image_id: str = Field(min_length=1)
    focus: str = Field(min_length=1)


class CompareMeasurementsArguments(ActionArguments):
    measurement_ids: Annotated[list[str], Field(min_length=2)]
    comparison_reason: str = Field(min_length=1)


class FinishInvestigationArguments(ActionArguments):
    outcome: FinishOutcome
    diagnosis: str | None
    confidence: float = Field(ge=0, le=1)
    evidence: Annotated[list[str], Field(min_length=1)]
    remaining_uncertainties: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_outcome(self) -> FinishInvestigationArguments:
        if self.outcome is FinishOutcome.DIAGNOSED and not self.diagnosis:
            raise ValueError("a diagnosed outcome requires a diagnosis")
        if (
            self.outcome is FinishOutcome.INSUFFICIENT_INFORMATION
            and self.diagnosis is not None
        ):
            raise ValueError(
                "an insufficient_information outcome cannot contain a diagnosis"
            )
        return self


class GenerateReportArguments(ActionArguments):
    investigation_id: str = Field(min_length=1)


DecisionArguments = (
    AskTechnicianArguments
    | RequestMeasurementArguments
    | AnalyzeImageArguments
    | CompareMeasurementsArguments
    | FinishInvestigationArguments
    | GenerateReportArguments
)

ARGUMENT_TYPES: dict[ToolName, type[ActionArguments]] = {
    ToolName.ASK_TECHNICIAN: AskTechnicianArguments,
    ToolName.REQUEST_MEASUREMENT: RequestMeasurementArguments,
    ToolName.ANALYZE_IMAGE: AnalyzeImageArguments,
    ToolName.COMPARE_MEASUREMENTS: CompareMeasurementsArguments,
    ToolName.FINISH_INVESTIGATION: FinishInvestigationArguments,
    ToolName.GENERATE_REPORT: GenerateReportArguments,
}


class AgentDecision(ContractModel):
    tool_name: ToolName
    arguments: DecisionArguments
    reason: str = Field(min_length=1)
    hypothesis_updates: list[HypothesisUpdate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_arguments_match_tool(self) -> AgentDecision:
        expected = ARGUMENT_TYPES[self.tool_name]
        if not isinstance(self.arguments, expected):
            raise ValueError(
                f"{self.tool_name.value} requires {expected.__name__} arguments"
            )
        return self

    @model_serializer(mode="wrap")
    def serialize_decision(self, handler):
        payload = handler(self)
        if not payload.get("hypothesis_updates"):
            payload.pop("hypothesis_updates", None)
        return payload


class PendingAction(ContractModel):
    action_id: str = Field(min_length=1)
    decision: AgentDecision


class Verification(ContractModel):
    id: str = Field(min_length=1)
    action_id: str = Field(min_length=1)
    distinguishes: Annotated[list[HypothesisId], Field(min_length=1)]
    observation_ids: Annotated[list[str], Field(min_length=1)]
    evidence_ids: Annotated[list[str], Field(min_length=1)]
    impacts: list[HypothesisImpact] = Field(default_factory=list)


class Conclusion(ContractModel):
    diagnosis: str
    confidence: float = Field(ge=0, le=1)
    evidence_ids: list[str]
    remaining_uncertainties: list[str]


class TimelineEvent(ContractModel):
    sequence: int = Field(ge=1)
    event_type: TimelineEventType
    summary: str = Field(min_length=1)
    details: dict[str, Any] = Field(default_factory=dict)


def initial_hypotheses() -> dict[HypothesisId, HypothesisState]:
    return {
        hypothesis_id: HypothesisState(hypothesis_id=hypothesis_id)
        for hypothesis_id in HypothesisId
    }


class InvestigationState(ContractModel):
    investigation_id: str = Field(min_length=1)
    status: InvestigationStatus = InvestigationStatus.INVESTIGATING
    step_count: int = Field(default=0, ge=0)
    max_steps: int = Field(default=20, ge=1)
    problem: Problem | None = None
    installation: InstallationData = Field(default_factory=InstallationData)
    hypotheses: dict[HypothesisId, HypothesisState] = Field(
        default_factory=initial_hypotheses
    )
    observations: dict[str, Observation] = Field(default_factory=dict)
    evidence: dict[str, Evidence] = Field(default_factory=dict)
    verifications: dict[str, Verification] = Field(default_factory=dict)
    measurements: dict[str, Measurement] = Field(default_factory=dict)
    pending_action: PendingAction | None = None
    timeline: list[TimelineEvent] = Field(default_factory=list)
    conclusion: Conclusion | None = None

    @model_validator(mode="after")
    def validate_hypothesis_set(self) -> InvestigationState:
        if set(self.hypotheses) != set(HypothesisId):
            raise ValueError("investigation state must contain exactly H0, H1, H2, H3")
        for key, hypothesis in self.hypotheses.items():
            if key is not hypothesis.hypothesis_id:
                raise ValueError("hypothesis dictionary key does not match its value")
        return self
