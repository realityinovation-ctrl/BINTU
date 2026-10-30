import {
  SOURCE_LABELS,
  measurementLabel,
  observationIsCited,
} from "../presentation/labels";
import type { InvestigationStateView, Observation } from "../types/investigation";

const GROUPS: { source: Observation["source_type"]; title: string }[] = [
  { source: "observation", title: "Observations" },
  { source: "technician_answer", title: "Réponses du technicien" },
  { source: "image_analysis", title: "Analyse d'image" },
];

export function KnownFacts({
  state,
  citedIds,
}: {
  state: InvestigationStateView;
  citedIds: Set<string>;
}) {
  const groups = GROUPS.map((group) => ({
    ...group,
    items: state.observations.filter((item) => item.source_type === group.source),
  })).filter((group) => group.items.length > 0);
  const hasMeasurements = state.measurements.length > 0;
  const empty = groups.length === 0 && !hasMeasurements;

  if (empty) {
    return <p className="empty-copy">Aucune information recueillie pour le moment.</p>;
  }

  return (
    <div className="knowledge-groups">
      {groups.map((group) => (
        <section className="knowledge-group" key={group.source} aria-label={group.title}>
          <h3>{group.title}</h3>
          <div className="evidence-grid">
            {group.items.map((observation) => {
              const cited = observationIsCited(observation.id, state.evidence, citedIds);
              return (
                <div className="evidence" key={observation.id}>
                  <span className="evidence-type">{SOURCE_LABELS[observation.source_type]}</span>
                  <span>
                    {observation.statement}
                    {cited && <span className="evidence-cited"> Preuve citée</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {hasMeasurements && (
        <section className="knowledge-group" aria-label="Mesures">
          <h3>Mesures</h3>
          <div className="evidence-grid">
            {state.measurements.map((measurement) => (
              <div className="evidence" key={measurement.id}>
                <span className="evidence-type">Mesure</span>
                <span>
                  <span>
                    {measurementLabel(state.measurement_catalog, measurement.measurement_type) ??
                      "Mesure"}
                  </span>{" "}
                  <strong>
                    {measurement.value} {measurement.unit}
                  </strong>
                  {measurement.location ? ` — ${measurement.location}` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
