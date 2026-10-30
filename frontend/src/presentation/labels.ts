import type {
  Hypothesis,
  InvestigationStatus,
  Measurement,
  MeasurementCatalogItem,
  Observation,
  PendingAction,
} from "../types/investigation";

export const HYPOTHESIS_LABELS: Record<Hypothesis["hypothesis_id"], string> = {
  H0: "Conditions normales",
  H1: "Panneaux / environnement",
  H2: "Chaîne électrique",
  H3: "Stockage / conversion",
};

export const HYPOTHESIS_STATUS_LABELS: Record<Hypothesis["status"], string> = {
  unexplored: "À explorer",
  plausible: "Plausible",
  supported: "Étayée",
  weakened: "Affaiblie",
  eliminated: "Éliminée",
};

export const STATUS_LABELS: Record<InvestigationStatus, string> = {
  investigating: "Diagnostic en cours",
  waiting_for_technician: "En attente de votre intervention",
  completed: "Diagnostic terminé",
  insufficient_information: "Informations insuffisantes",
};

export const STATUS_KIND: Record<
  InvestigationStatus,
  "blue" | "amber" | "green" | "gray"
> = {
  investigating: "blue",
  waiting_for_technician: "amber",
  completed: "green",
  insufficient_information: "amber",
};

const TIMELINE_ACTIONS: Record<string, string> = {
  ask_technician: "Question posée.",
  request_measurement: "Mesure demandée.",
  analyze_image: "Image analysée.",
  finish_investigation: "Conclusion du diagnostic.",
  compare_measurements: "Comparaison de mesures.",
  generate_report: "Rapport demandé.",
};

const TIMELINE_SOURCES: Record<string, string> = {
  observation: "une observation",
  measurement: "une mesure",
  technician_answer: "une réponse du technicien",
  image_analysis: "une analyse d'image",
};

const TIMELINE_WORDS: Record<string, string> = {
  ...STATUS_LABELS,
  ...HYPOTHESIS_STATUS_LABELS,
};

export function statusLabel(status: string): string {
  return status in STATUS_LABELS
    ? STATUS_LABELS[status as InvestigationStatus]
    : "Diagnostic";
}

const GENERIC_REASON =
  "Cette information aidera BINTU à poursuivre le diagnostic.";

const KNOWN_REASONS: Record<string, string> = {
  "gather initial system context before testing hypotheses":
    "BINTU a besoin de mieux comprendre l’installation avant de tester ses hypothèses.",
  "gather initial context for zero production":
    "BINTU a besoin de mieux comprendre l’installation avant de tester ses hypothèses.",
};

const FRENCH_MARKERS =
  /\b(le|la|les|un|une|des|du|de|pour|dans|avec|sur|avant|apres|après|depuis|cette|cet|ces|aucun|aucune|mesure|observation|hypothese|hypothèse|diagnostic|verifier|vérifier|demander|poursuivre|obtenir|conclure|preuve|tension|deja|déjà|fournie|existe|qualif)\b/i;

const ENGLISH_OR_TECHNICAL =
  /\b(the|before|after|gather|initial|context|testing|hypotheses|please|need|check|verify|because|without|should|would|could|unknown|error|failed|provider|rejected|forbidden|conductor|energized|disconnect|opening|decision)\b|[a-z]+_[a-z]+|\b(ask_technician|request_measurement|analyze_image|finish_investigation|compare_measurements|generate_report)\b/i;

export function presentReason(reason: string): string {
  const trimmed = reason.trim();
  const key = trimmed.toLowerCase().replace(/\.+$/, "");
  if (key in KNOWN_REASONS) return KNOWN_REASONS[key];
  if (FRENCH_MARKERS.test(trimmed) || /[À-ÿ]/.test(trimmed)) return trimmed;
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  if (ENGLISH_OR_TECHNICAL.test(trimmed) || words >= 4) return GENERIC_REASON;
  return trimmed;
}

export function humanizeTimelineSummary(summary: string): string {
  const action = summary.match(/^Action externe demandée : ([a-z_]+)\.$/);
  if (action) return TIMELINE_ACTIONS[action[1]] ?? "Action demandée.";

  const statusChange = summary.match(/^Statut : ([a-z_]+) -> ([a-z_]+)\.$/);
  if (statusChange) {
    const from = TIMELINE_WORDS[statusChange[1]] ?? "Diagnostic";
    const to = TIMELINE_WORDS[statusChange[2]] ?? "Diagnostic";
    return `Statut : ${from} → ${to}.`;
  }

  const hypothesisChange = summary.match(/^(H[0-3]): ([a-z_]+) -> ([a-z_]+)\.$/);
  if (
    hypothesisChange &&
    hypothesisChange[1] in HYPOTHESIS_LABELS
  ) {
    const id = hypothesisChange[1] as Hypothesis["hypothesis_id"];
    const from = TIMELINE_WORDS[hypothesisChange[2]] ?? "À explorer";
    const to = TIMELINE_WORDS[hypothesisChange[3]] ?? "À explorer";
    return `${HYPOTHESIS_LABELS[id]} : ${from} → ${to}.`;
  }

  const added = summary.match(/^Observation ajoutée depuis ([a-z_]+)\.$/);
  if (added) {
    const source = TIMELINE_SOURCES[added[1]] ?? "le terrain";
    return `Information enregistrée depuis ${source}.`;
  }

  return presentReason(
    summary
      .replaceAll("l'investigation", "le diagnostic")
      .replaceAll("L'investigation", "Le diagnostic"),
  );
}

export const SOURCE_LABELS: Record<Observation["source_type"], string> = {
  observation: "Observation",
  measurement: "Mesure",
  technician_answer: "Technicien",
  image_analysis: "Image",
};

const INSTALLATION_LABELS: Record<string, string> = {
  nominal_power_kwp: "Puissance nominale",
  panel_count: "Nombre de panneaux",
  inverter_model: "Onduleur",
  battery_present: "Batterie",
  battery_capacity_kwh: "Capacité de batterie",
  system_voltage_v: "Tension du système",
};

const HYPOTHESIS_IDS = new Set<string>(["H0", "H1", "H2", "H3"]);

export type SpineStepId =
  | "problem"
  | "evidence"
  | "hypotheses"
  | "verification"
  | "result"
  | "diagnosis";

export type SpineStepState = "complete" | "current" | "upcoming";

export const SPINE_STEPS: { id: SpineStepId; label: string }[] = [
  { id: "problem", label: "Problème" },
  { id: "evidence", label: "Preuves" },
  { id: "hypotheses", label: "Hypothèses" },
  { id: "verification", label: "Prochaine vérification" },
  { id: "result", label: "Résultat" },
  { id: "diagnosis", label: "Diagnostic" },
];

function textArgument(
  arguments_: Record<string, unknown>,
  key: string,
): string | null {
  const value = arguments_[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function measurementLabel(
  catalog: MeasurementCatalogItem[],
  measurementType: string,
): string | null {
  return (
    catalog.find((item) => item.measurement_type === measurementType)?.label ??
    null
  );
}

export function measurementLine(
  measurement: Measurement,
  catalog: MeasurementCatalogItem[],
): string {
  const label = measurementLabel(catalog, measurement.measurement_type) ?? "Mesure";
  return `${label} : ${measurement.value} ${measurement.unit} — ${measurement.location}`;
}

export function installationEntries(
  installation: Record<string, string | number | boolean | null>,
): { label: string; value: string }[] {
  return Object.entries(installation).flatMap(([key, value]) => {
    const label = INSTALLATION_LABELS[key];
    if (!label || value === null) return [];
    return [
      {
        label,
        value: typeof value === "boolean" ? (value ? "Oui" : "Non") : String(value),
      },
    ];
  });
}

export function distinguishesLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "string" || !HYPOTHESIS_IDS.has(item)) return [];
    return [HYPOTHESIS_LABELS[item as Hypothesis["hypothesis_id"]]];
  });
}

export function gestureFor(
  action: PendingAction,
  catalog: MeasurementCatalogItem[],
): string | null {
  const args = action.arguments;
  switch (action.tool_name) {
    case "ask_technician":
      return textArgument(args, "question");
    case "request_measurement": {
      const type = textArgument(args, "measurement_type");
      const location = textArgument(args, "location");
      const label = type ? measurementLabel(catalog, type) : null;
      return [label, location].filter(Boolean).join(" — ") || null;
    }
    case "analyze_image":
      return textArgument(args, "focus");
    case "compare_measurements":
      return textArgument(args, "comparison_reason");
    default:
      return null;
  }
}

export function citedEvidenceIds(
  evidenceIds: string[] | undefined,
): Set<string> {
  return new Set(evidenceIds ?? []);
}

export function observationIsCited(
  observationId: string,
  evidence: { id: string; observation_id: string }[],
  citedIds: Set<string>,
): boolean {
  return evidence.some(
    (item) => item.observation_id === observationId && citedIds.has(item.id),
  );
}

export function spineStates(input: {
  hasProblem: boolean;
  hasCollected: boolean;
  hasHypothesisMovement: boolean;
  status: InvestigationStatus;
}): Record<SpineStepId, SpineStepState> {
  const terminal =
    input.status === "completed" ||
    input.status === "insufficient_information";
  return {
    problem: input.hasProblem ? "complete" : "upcoming",
    evidence: input.hasCollected ? "complete" : "upcoming",
    hypotheses: input.hasHypothesisMovement ? "complete" : "upcoming",
    verification: terminal ? "complete" : "current",
    result: terminal ? "complete" : "upcoming",
    diagnosis: terminal ? "current" : "upcoming",
  };
}
