const ENTITY_LABELS: Record<string, string> = {
  city: "Ville",
  site_location: "Site",
  sector: "Secteur",
  equipment: "Équipement",
  model: "Modèle",
  manufacturer: "Fabricant",
  symptom: "Symptôme",
  project: "Projet",
  customer: "Client",
  inverter: "Onduleur",
  battery: "Batterie",
};

export function entityLabel(key: string): string {
  return ENTITY_LABELS[key] ?? key.replace(/_/g, " ");
}

export function memoryBackendLabel(backend: string | undefined): string {
  const value = (backend ?? "local").trim().toLowerCase();
  if (value === "off" || value === "disabled") return "Mémoire désactivée";
  if (value === "mem0") return "Mem0";
  if (value === "local") return "Mémoire locale";
  return backend || "Mémoire";
}
