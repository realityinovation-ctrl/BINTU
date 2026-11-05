/** Provider-neutral Agent Contract v0.2. Extra fields are rejected. */

import { z } from "zod";

const stringList = () => z.array(z.string()).default(() => []);

export const hypothesisIdSchema = z.enum(["H0", "H1", "H2", "H3"]);
export type HypothesisId = z.infer<typeof hypothesisIdSchema>;

export const hypothesisStatusSchema = z.enum([
  "unexplored",
  "plausible",
  "supported",
  "weakened",
  "eliminated",
]);
export type HypothesisStatus = z.infer<typeof hypothesisStatusSchema>;

export const investigationStatusSchema = z.enum([
  "investigating",
  "waiting_for_technician",
  "completed",
  "insufficient_information",
]);
export type InvestigationStatus = z.infer<typeof investigationStatusSchema>;

export const evidenceSourceTypeSchema = z.enum([
  "observation",
  "measurement",
  "technician_answer",
  "image_analysis",
]);
export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;

export const evidenceRelationSchema = z.enum(["supporting", "contradictory"]);
export type EvidenceRelation = z.infer<typeof evidenceRelationSchema>;

export const evidenceStrengthSchema = z.enum(["indicative", "strong"]);
export type EvidenceStrength = z.infer<typeof evidenceStrengthSchema>;

export const toolNameSchema = z.enum([
  "ask_technician",
  "request_measurement",
  "analyze_image",
  "compare_measurements",
  "finish_investigation",
  "generate_report",
]);
export type ToolName = z.infer<typeof toolNameSchema>;

export const finishOutcomeSchema = z.enum([
  "diagnosed",
  "insufficient_information",
]);
export type FinishOutcome = z.infer<typeof finishOutcomeSchema>;

export const timelineEventTypeSchema = z.enum([
  "decision_recorded",
  "status_changed",
  "hypothesis_changed",
  "observation_added",
  "verification_recorded",
  "evidence_added",
  "action_requested",
  "action_resumed",
]);
export type TimelineEventType = z.infer<typeof timelineEventTypeSchema>;

export const problemSchema = z
  .object({
    description: z.string().min(1),
  })
  .strict();
export type Problem = z.infer<typeof problemSchema>;

const evidenceValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

function certaintyOrigin(
  sourceType: EvidenceSourceType,
  certainty: number | null,
  noun: "observation" | "evidence",
  ctx: z.RefinementCtx,
): void {
  if (sourceType === "image_analysis") {
    if (certainty === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `image_analysis ${noun} requires certainty`,
      });
    }
    return;
  }
  if (certainty !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `certainty is only valid for image_analysis ${noun}`,
    });
  }
}

export const observationSchema = z
  .object({
    id: z.string().min(1),
    source_type: evidenceSourceTypeSchema,
    source_id: z.string().min(1),
    statement: z.string().min(1),
    value: evidenceValueSchema.nullable().default(null),
    unit: z.string().nullable().default(null),
    certainty: z.number().min(0).max(1).nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    certaintyOrigin(value.source_type, value.certainty, "observation", ctx);
  });
export type Observation = z.infer<typeof observationSchema>;

export const evidenceSchema = z
  .object({
    id: z.string().min(1),
    observation_id: z.string().min(1),
    source_type: evidenceSourceTypeSchema,
    source_id: z.string().min(1),
    certainty: z.number().min(0).max(1).nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    certaintyOrigin(value.source_type, value.certainty, "evidence", ctx);
  });
export type Evidence = z.infer<typeof evidenceSchema>;

export const measurementSchema = z
  .object({
    id: z.string().min(1),
    measurement_type: z.string().min(1),
    location: z.string().min(1),
    value: z.number(),
    unit: z.string().min(1),
    source_id: z.string().min(1),
  })
  .strict();
export type Measurement = z.infer<typeof measurementSchema>;

export const hypothesisStateSchema = z
  .object({
    hypothesis_id: hypothesisIdSchema,
    status: hypothesisStatusSchema.default("unexplored"),
    supporting_evidence_ids: stringList(),
    contradictory_evidence_ids: stringList(),
  })
  .strict();
export type HypothesisState = z.infer<typeof hypothesisStateSchema>;

export const hypothesisImpactSchema = z
  .object({
    hypothesis_id: hypothesisIdSchema,
    relation: evidenceRelationSchema,
    strength: evidenceStrengthSchema,
  })
  .strict();
export type HypothesisImpact = z.infer<typeof hypothesisImpactSchema>;

export const hypothesisUpdateSchema = z
  .object({
    hypothesis_id: hypothesisIdSchema,
    relation: evidenceRelationSchema,
    strength: evidenceStrengthSchema,
    status: hypothesisStatusSchema,
    evidence_ids: z.array(z.string()),
    reason: z.string().min(1),
  })
  .strict();
export type HypothesisUpdate = z.infer<typeof hypothesisUpdateSchema>;

const distinguishesSchema = z.array(hypothesisIdSchema).min(1);

export const askTechnicianArgumentsSchema = z
  .object({
    distinguishes: distinguishesSchema,
    question: z.string().min(1),
  })
  .strict();
export type AskTechnicianArguments = z.infer<typeof askTechnicianArgumentsSchema>;

export const requestMeasurementArgumentsSchema = z
  .object({
    distinguishes: distinguishesSchema,
    measurement_type: z.string().min(1),
    location: z.string().min(1),
    unit: z.string().min(1),
  })
  .strict();
export type RequestMeasurementArguments = z.infer<
  typeof requestMeasurementArgumentsSchema
>;

export const analyzeImageArgumentsSchema = z
  .object({
    distinguishes: distinguishesSchema,
    image_id: z.string().min(1),
    focus: z.string().min(1),
  })
  .strict();
export type AnalyzeImageArguments = z.infer<typeof analyzeImageArgumentsSchema>;

export const compareMeasurementsArgumentsSchema = z
  .object({
    distinguishes: distinguishesSchema,
    measurement_ids: z.array(z.string()).min(2),
    comparison_reason: z.string().min(1),
  })
  .strict();
export type CompareMeasurementsArguments = z.infer<
  typeof compareMeasurementsArgumentsSchema
>;

export const finishInvestigationArgumentsSchema = z
  .object({
    distinguishes: distinguishesSchema,
    outcome: finishOutcomeSchema,
    diagnosis: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string()).min(1),
    remaining_uncertainties: stringList(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.outcome === "diagnosed" && !value.diagnosis) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a diagnosed outcome requires a diagnosis",
      });
    }
    if (
      value.outcome === "insufficient_information" &&
      value.diagnosis !== null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "an insufficient_information outcome cannot contain a diagnosis",
      });
    }
  });
export type FinishInvestigationArguments = z.infer<
  typeof finishInvestigationArgumentsSchema
>;

export const generateReportArgumentsSchema = z
  .object({
    distinguishes: distinguishesSchema,
    investigation_id: z.string().min(1),
  })
  .strict();
export type GenerateReportArguments = z.infer<
  typeof generateReportArgumentsSchema
>;

export type DecisionArguments =
  | AskTechnicianArguments
  | RequestMeasurementArguments
  | AnalyzeImageArguments
  | CompareMeasurementsArguments
  | FinishInvestigationArguments
  | GenerateReportArguments;

const decisionFields = {
  reason: z.string().min(1),
  hypothesis_updates: z.array(hypothesisUpdateSchema).default(() => []),
};

export const agentDecisionSchema = z.discriminatedUnion("tool_name", [
  z
    .object({
      tool_name: z.literal("ask_technician"),
      arguments: askTechnicianArgumentsSchema,
      ...decisionFields,
    })
    .strict(),
  z
    .object({
      tool_name: z.literal("request_measurement"),
      arguments: requestMeasurementArgumentsSchema,
      ...decisionFields,
    })
    .strict(),
  z
    .object({
      tool_name: z.literal("analyze_image"),
      arguments: analyzeImageArgumentsSchema,
      ...decisionFields,
    })
    .strict(),
  z
    .object({
      tool_name: z.literal("compare_measurements"),
      arguments: compareMeasurementsArgumentsSchema,
      ...decisionFields,
    })
    .strict(),
  z
    .object({
      tool_name: z.literal("finish_investigation"),
      arguments: finishInvestigationArgumentsSchema,
      ...decisionFields,
    })
    .strict(),
  z
    .object({
      tool_name: z.literal("generate_report"),
      arguments: generateReportArgumentsSchema,
      ...decisionFields,
    })
    .strict(),
]);
export type AgentDecision = z.infer<typeof agentDecisionSchema>;

export const pendingActionSchema = z
  .object({
    action_id: z.string().min(1),
    decision: agentDecisionSchema,
  })
  .strict();
export type PendingAction = z.infer<typeof pendingActionSchema>;

export const verificationSchema = z
  .object({
    id: z.string().min(1),
    action_id: z.string().min(1),
    distinguishes: distinguishesSchema,
    observation_ids: z.array(z.string()).min(1),
    evidence_ids: z.array(z.string()).min(1),
    impacts: z.array(hypothesisImpactSchema).default(() => []),
  })
  .strict();
export type Verification = z.infer<typeof verificationSchema>;

export const conclusionSchema = z
  .object({
    diagnosis: z.string(),
    confidence: z.number().min(0).max(1),
    evidence_ids: z.array(z.string()),
    remaining_uncertainties: z.array(z.string()),
  })
  .strict();
export type Conclusion = z.infer<typeof conclusionSchema>;

export const timelineEventSchema = z
  .object({
    sequence: z.number().int().min(1),
    event_type: timelineEventTypeSchema,
    summary: z.string().min(1),
    details: z.record(z.string(), z.unknown()).default(() => ({})),
  })
  .strict();
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const diagnosticSystemSchema = z
  .object({
    domain: z.string().min(1).default("photovoltaic"),
    type: z.string().min(1).default("photovoltaic_installation"),
    manufacturer: z.string().nullable().default(null),
    model: z.string().nullable().default(null),
    characteristics: z
      .record(
        z.string(),
        z.union([z.string(), z.boolean(), z.number(), z.null()]),
      )
      .default(() => ({})),
  })
  .strict();
export type DiagnosticSystem = z.infer<typeof diagnosticSystemSchema>;

export const hypothesesSchema = z
  .object({
    H0: hypothesisStateSchema,
    H1: hypothesisStateSchema,
    H2: hypothesisStateSchema,
    H3: hypothesisStateSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const id of hypothesisIdSchema.options) {
      if (value[id].hypothesis_id !== id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "hypothesis dictionary key does not match its value",
        });
      }
    }
  });

export const investigationStateSchema = z
  .object({
    investigation_id: z.string().min(1),
    status: investigationStatusSchema.default("investigating"),
    step_count: z.number().int().min(0).default(0),
    max_steps: z.number().int().min(1).default(20),
    problem: problemSchema.nullable().default(null),
    system: diagnosticSystemSchema.default(() => diagnosticSystemSchema.parse({})),
    hypotheses: hypothesesSchema,
    observations: z.record(z.string(), observationSchema).default(() => ({})),
    evidence: z.record(z.string(), evidenceSchema).default(() => ({})),
    verifications: z.record(z.string(), verificationSchema).default(() => ({})),
    measurements: z.record(z.string(), measurementSchema).default(() => ({})),
    pending_action: pendingActionSchema.nullable().default(null),
    timeline: z.array(timelineEventSchema).default(() => []),
    conclusion: conclusionSchema.nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = hypothesisIdSchema.options;
    if (new Set(Object.keys(value.hypotheses)).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "investigation state must contain exactly H0, H1, H2, H3",
      });
    }
  });
export type InvestigationState = z.infer<typeof investigationStateSchema>;

export function parseState(input: unknown): InvestigationState {
  return investigationStateSchema.parse(input);
}

export function parseDecision(input: unknown): AgentDecision {
  return agentDecisionSchema.parse(input);
}

/** Match Pydantic: an empty hypothesis proposal is omitted from the snapshot. */
export function dumpState(state: InvestigationState): unknown {
  const copy = structuredClone(state) as {
    pending_action: { decision: { hypothesis_updates?: unknown } } | null;
  };
  const decision = copy.pending_action?.decision;
  if (
    decision !== undefined &&
    Array.isArray(decision.hypothesis_updates) &&
    decision.hypothesis_updates.length === 0
  ) {
    delete decision.hypothesis_updates;
  }
  return copy;
}
