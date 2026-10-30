import type {
  Evidence,
  Hypothesis,
  Measurement,
  MeasurementCatalogItem,
  Observation,
} from "../types/investigation";
import { HypothesesPanel } from "./HypothesesPanel";
import {
  installationEntries,
  measurementLabel,
  measurementLine,
  observationIsCited,
  SOURCE_LABELS,
} from "../presentation/labels";

function linkedMeasurement(
  observation: Observation,
  measurements: Measurement[],
): Measurement | undefined {
  if (observation.source_type !== "measurement") return undefined;
  return measurements.find((item) => item.id === observation.source_id);
}

export function Dossier({
  open,
  onClose,
  observations,
  measurements,
  evidence,
  citedIds,
  hypotheses,
  catalog,
  installation,
}: {
  open: boolean;
  onClose: () => void;
  observations: Observation[];
  measurements: Measurement[];
  evidence: Evidence[];
  citedIds: Set<string>;
  hypotheses: Hypothesis[];
  catalog: MeasurementCatalogItem[];
  installation: Record<string, string | number | boolean | null>;
}) {
  const knownInstallation = installationEntries(installation);
  return (
    <aside
      id="dossier"
      className={open ? "dossier is-open" : "dossier"}
      aria-label="Dossier"
    >
      <div className="dossier-toolbar">
        <p className="eyebrow">Dossier</p>
        <button className="dossier-close" type="button" onClick={onClose}>
          Fermer
        </button>
      </div>

      <section className="dossier-section" aria-labelledby="collected-title">
        <h2 id="collected-title">Preuves et informations</h2>
        {observations.length === 0 ? (
          <p className="empty-copy">Aucune information recueillie pour le moment.</p>
        ) : (
          <ol className="collected-list">
            {observations.map((observation) => {
              const measurement = linkedMeasurement(observation, measurements);
              const cited = observationIsCited(observation.id, evidence, citedIds);
              return (
                <li key={observation.id}>
                  <span className={cited ? "proof-mark proof-cited" : "proof-mark"}>
                    {cited ? "Preuve citée" : "Information recueillie"}
                  </span>
                  <span className={`type-chip type-${observation.source_type}`}>
                    {SOURCE_LABELS[observation.source_type]}
                  </span>
                  {measurement ? (
                    <>
                      <p>
                        {measurementLabel(catalog, measurement.measurement_type) ??
                          "Mesure"}
                      </p>
                      <strong className="observation-value">
                        {measurement.value} {measurement.unit}
                      </strong>
                      <span className="measurement-place">{measurement.location}</span>
                    </>
                  ) : (
                    <p>{observation.statement}</p>
                  )}
                  {!measurement && observation.value !== null && (
                    <strong className="observation-value">
                      {String(observation.value)}
                      {observation.unit ? ` ${observation.unit}` : ""}
                    </strong>
                  )}
                  {observation.certainty !== null && (
                    <span className="certainty">
                      Certitude fournie : {Math.round(observation.certainty * 100)} %
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <HypothesesPanel hypotheses={hypotheses} />

      <section className="dossier-section" aria-labelledby="measurements-title">
        <h2 id="measurements-title">Mesures</h2>
        {measurements.length === 0 ? (
          <p className="empty-copy">Aucune mesure enregistrée.</p>
        ) : (
          <ul className="measurement-list">
            {measurements.map((measurement) => (
              <li key={measurement.id}>{measurementLine(measurement, catalog)}</li>
            ))}
          </ul>
        )}
      </section>

      <details className="installation-details">
        <summary>Installation</summary>
        {knownInstallation.length === 0 ? (
          <p className="empty-copy">Aucune donnée d'installation renseignée.</p>
        ) : (
          <dl>
            {knownInstallation.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </details>
    </aside>
  );
}
