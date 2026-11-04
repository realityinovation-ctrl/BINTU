import type { IconName } from "../components/Icons";

/** Domaines du hub desk — guident le texte de problème (même API mobile). */
export interface DiagnosticDomain {
  id: string;
  /** Valeur injectée dans la description pour orienter le Core / IA. */
  guideTag: string;
  label: string;
  shortLabel: string;
  detail: string;
  focus: string;
  icon: IconName;
  status: "ready" | "preview";
  accent: "blue" | "amber" | "teal" | "slate";
}

export const DIAGNOSTIC_DOMAINS: DiagnosticDomain[] = [
  {
    id: "photovoltaic",
    guideTag: "photovoltaïque / installation PV",
    label: "Photovoltaïque",
    shortLabel: "PV",
    detail: "Panneaux, onduleur, chaîne DC/AC, production faible.",
    focus: "Mesures électriques et observations terrain",
    icon: "bolt",
    status: "ready",
    accent: "amber",
  },
  {
    id: "electric_motor",
    guideTag: "moteur électrique AC / machine tournante",
    label: "Moteur électrique AC",
    shortLabel: "Moteur",
    detail: "Surchauffe, vibration, démarrage, bobinage, roulements.",
    focus: "Symptômes mécaniques et électriques",
    icon: "activity",
    status: "preview",
    accent: "blue",
  },
  {
    id: "transformer",
    guideTag: "transformateur / poste de transformation",
    label: "Transformateur",
    shortLabel: "Transfo",
    detail: "Poste HT/BT, échauffement, isolement, régimes anormaux.",
    focus: "Schémas et relevés thermiques",
    icon: "spark",
    status: "preview",
    accent: "teal",
  },
  {
    id: "plc",
    guideTag: "automate programmable / logique PLC",
    label: "Automate PLC",
    shortLabel: "PLC",
    detail: "Erreur de logique, I/O, séquence d’automatisme bloquée.",
    focus: "Logs, états et séquences",
    icon: "list",
    status: "preview",
    accent: "slate",
  },
  {
    id: "installation",
    guideTag: "installation technique globale",
    label: "Installation globale",
    shortLabel: "Site",
    detail: "Vue d’ensemble multi-équipements, performance du site.",
    focus: "Contexte système et priorités",
    icon: "search",
    status: "preview",
    accent: "blue",
  },
  {
    id: "generic",
    guideTag: "équipement technique générique",
    label: "Autre équipement",
    shortLabel: "Autre",
    detail: "Tout équipement hors catalogue — BINTU s’adapte au récit.",
    focus: "Description libre guidée",
    icon: "help",
    status: "ready",
    accent: "slate",
  },
];

export function findDomain(id: string | null | undefined): DiagnosticDomain | null {
  if (!id) return null;
  return DIAGNOSTIC_DOMAINS.find((item) => item.id === id) ?? null;
}

export function domainGuidePrefix(domain: DiagnosticDomain): string {
  return `Domaine diagnostique : ${domain.guideTag}`;
}
