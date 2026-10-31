export type InvestigationStatus =
  | "investigating"
  | "waiting_for_technician"
  | "completed"
  | "insufficient_information";

export type ToolName =
  | "ask_technician"
  | "request_measurement"
  | "analyze_image"
  | "compare_measurements"
  | "finish_investigation"
  | "generate_report";

export interface Problem {
  description: string;
}

export interface Observation {
  id: string;
  source_type:
    | "observation"
    | "measurement"
    | "technician_answer"
    | "image_analysis";
  source_id: string;
  statement: string;
  value: string | number | boolean | null;
  unit: string | null;
  certainty: number | null;
}

export interface Measurement {
  id: string;
  measurement_type: string;
  location: string;
  value: number;
  unit: string;
  source_id: string;
  source_type: "measurement";
}

export interface MeasurementCatalogItem {
  measurement_type: string;
  label: string;
  unit: string;
}

export interface Hypothesis {
  hypothesis_id: "H0" | "H1" | "H2" | "H3";
  status: "unexplored" | "plausible" | "supported" | "weakened" | "eliminated";
  supporting_evidence_ids: string[];
  contradictory_evidence_ids: string[];
}

export interface Evidence {
  id: string;
  observation_id: string;
  source_type: Observation["source_type"];
  source_id: string;
  certainty: number | null;
}

export interface PendingAction {
  action_id: string;
  tool_name: ToolName;
  arguments: Record<string, unknown>;
  reason: string;
}

export interface Conclusion {
  diagnosis: string;
  confidence: number;
  evidence_ids: string[];
  remaining_uncertainties: string[];
}

export interface TimelineEvent {
  sequence: number;
  event_type: string;
  summary: string;
  details: Record<string, unknown>;
}

export interface DiagnosticSystem {
  domain: string;
  type: string;
  manufacturer: string | null;
  model: string | null;
  characteristics: Record<string, string | number | boolean | null>;
}

export interface InvestigationStateView {
  problem: Problem | null;
  system: DiagnosticSystem;
  measurement_catalog: MeasurementCatalogItem[];
  observations: Observation[];
  measurements: Measurement[];
  hypotheses: Hypothesis[];
  evidence: Evidence[];
  pending_action: PendingAction | null;
  conclusion: Conclusion | null;
  timeline: TimelineEvent[];
}

export interface Investigation {
  investigation_id: string;
  status: InvestigationStatus;
  state: InvestigationStateView;
}
