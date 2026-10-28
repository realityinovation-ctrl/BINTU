import type { Observation } from "../types/investigation";

const SOURCE_LABELS: Record<Observation["source_type"], string> = {
  observation: "Observation",
  measurement: "Mesure reçue",
  technician_answer: "Réponse du technicien",
  image_analysis: "Analyse d'image",
};

export function InvestigationFlow({
  observations,
}: {
  observations: Observation[];
}) {
  return (
    <section className="card investigation-flow" aria-labelledby="flow-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Ce que BINTU sait</p>
          <h2 id="flow-title">Éléments recueillis</h2>
        </div>
        <span className="count-badge">{observations.length}</span>
      </div>
      {observations.length === 0 ? (
        <p className="empty-copy">
          Aucun élément recueilli pour le moment. BINTU commence son enquête.
        </p>
      ) : (
        <ol className="observation-list">
          {observations.map((observation) => (
            <li key={observation.id} className="observation-item">
              <span className="observation-source">
                {SOURCE_LABELS[observation.source_type]}
              </span>
              <p>{observation.statement}</p>
              {observation.value !== null && (
                <strong className="observation-value">
                  {String(observation.value)}
                  {observation.unit ? ` ${observation.unit}` : ""}
                </strong>
              )}
              {observation.certainty !== null && (
                <span className="certainty">
                  Certitude fournie :{" "}
                  {Math.round(observation.certainty * 100)} %
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
