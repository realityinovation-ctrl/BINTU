import type {
  Investigation,
  InvestigationStatus,
  PendingAction,
} from "../types/investigation";

export function makeInvestigation(
  status: InvestigationStatus = "waiting_for_technician",
  pendingAction: PendingAction | null = {
    action_id: "action-1",
    tool_name: "ask_technician",
    arguments: {
      question: "Quel état est affiché par l'onduleur ?",
      distinguishes: ["H0", "H2"],
    },
    reason: "Obtenir une observation avant de poursuivre.",
  },
): Investigation {
  return {
    investigation_id: "inv-12345678",
    status,
    state: {
      problem: {
        description: "La production solaire est anormalement faible.",
      },
      installation: {
        nominal_power_kwp: null,
        panel_count: null,
        inverter_model: null,
        battery_present: null,
        battery_capacity_kwh: null,
        system_voltage_v: null,
      },
      measurement_catalog: [
        {
          measurement_type: "dc_voltage",
          label: "Tension DC",
          unit: "V",
        },
        {
          measurement_type: "dc_current",
          label: "Courant DC",
          unit: "A",
        },
        {
          measurement_type: "ac_voltage",
          label: "Tension AC",
          unit: "V",
        },
        {
          measurement_type: "ac_current",
          label: "Courant AC",
          unit: "A",
        },
        {
          measurement_type: "ac_power",
          label: "Puissance AC",
          unit: "W",
        },
      ],
      observations: [],
      measurements: [],
      hypotheses: [
        {
          hypothesis_id: "H0",
          status: "unexplored",
          supporting_evidence_ids: [],
          contradictory_evidence_ids: [],
        },
        {
          hypothesis_id: "H1",
          status: "plausible",
          supporting_evidence_ids: [],
          contradictory_evidence_ids: [],
        },
        {
          hypothesis_id: "H2",
          status: "unexplored",
          supporting_evidence_ids: [],
          contradictory_evidence_ids: [],
        },
        {
          hypothesis_id: "H3",
          status: "unexplored",
          supporting_evidence_ids: [],
          contradictory_evidence_ids: [],
        },
      ],
      evidence: [],
      pending_action: pendingAction,
      conclusion:
        status === "completed"
          ? {
              diagnosis: "Conditions normales confirmées.",
              confidence: 0.9,
              evidence_ids: ["e-1"],
              remaining_uncertainties: [],
            }
          : null,
      timeline: [
        {
          sequence: 1,
          event_type: "decision_recorded",
          summary: "Première question enregistrée.",
          details: {},
        },
      ],
    },
  };
}
