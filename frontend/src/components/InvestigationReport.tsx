import type { InvestigationStateView } from "../types/investigation";

const HYPOTHESIS_LABELS = {
  H0: "Conditions normales",
  H1: "Panneaux / environnement",
  H2: "Chaîne électrique",
  H3: "Stockage / conversion",
} as const;

const STATUS_LABELS = {
  unexplored: "À explorer",
  plausible: "Plausible",
  supported: "Étayée",
  weakened: "Affaiblie",
  eliminated: "Éliminée",
} as const;

export function InvestigationReport({
  state,
  insufficient,
}: {
  state: InvestigationStateView;
  insufficient: boolean;
}) {
  const conclusion = state.conclusion;
  const cited = (conclusion?.evidence_ids ?? [])
    .map((evidenceId) => {
      const evidence = state.evidence.find((item) => item.id === evidenceId);
      const observation = state.observations.find(
        (item) => item.id === evidence?.observation_id,
      );
      return {
        evidenceId,
        statement: observation?.statement ?? null,
      };
    });

  return (
    <section className="result-card report-card" aria-labelledby="report-title">
      <p className="eyebrow">Rapport d&apos;enquête</p>
      <h2 id="report-title">
        {insufficient ? "Informations insuffisantes" : "Diagnostic terminé"}
      </h2>
      {state.problem && <p>{state.problem.description}</p>}
      {insufficient ? (
        <p>Informations insuffisantes pour établir un diagnostic fiable.</p>
      ) : (
        conclusion && (
          <>
            <p className="diagnosis">{conclusion.diagnosis}</p>
            <span>
              Confiance fournie : {Math.round(conclusion.confidence * 100)} %
            </span>
          </>
        )
      )}

      <h3>Preuves citées</h3>
      {cited.length === 0 ? (
        <p className="empty-copy">Aucune preuve citée.</p>
      ) : (
        <ul className="report-list">
          {cited.map((item) => (
            <li key={item.evidenceId}>
              {item.statement ?? item.evidenceId}
            </li>
          ))}
        </ul>
      )}

      {conclusion && conclusion.remaining_uncertainties.length > 0 && (
        <>
          <h3>Incertitudes restantes</h3>
          <ul className="report-list">
            {conclusion.remaining_uncertainties.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}

      <h3>Mesures</h3>
      {state.measurements.length === 0 ? (
        <p className="empty-copy">Aucune mesure enregistrée.</p>
      ) : (
        <ul className="report-list">
          {state.measurements.map((measurement) => (
            <li key={measurement.id}>
              {measurement.measurement_type} : {measurement.value}{" "}
              {measurement.unit} — {measurement.location}
            </li>
          ))}
        </ul>
      )}

      <h3>Hypothèses</h3>
      <ul className="report-list">
        {state.hypotheses.map((hypothesis) => (
          <li key={hypothesis.hypothesis_id}>
            {HYPOTHESIS_LABELS[hypothesis.hypothesis_id]} :{" "}
            {STATUS_LABELS[hypothesis.status]}
          </li>
        ))}
      </ul>
    </section>
  );
}
