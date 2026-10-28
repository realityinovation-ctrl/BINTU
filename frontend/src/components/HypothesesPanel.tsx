import type { Hypothesis } from "../types/investigation";

const HYPOTHESIS_LABELS: Record<Hypothesis["hypothesis_id"], string> = {
  H0: "Conditions normales",
  H1: "Panneaux / environnement",
  H2: "Chaîne électrique",
  H3: "Stockage / conversion",
};

const STATUS_LABELS: Record<Hypothesis["status"], string> = {
  unexplored: "À explorer",
  plausible: "Plausible",
  supported: "Étayée",
  weakened: "Affaiblie",
  eliminated: "Éliminée",
};

export function HypothesesPanel({
  hypotheses,
}: {
  hypotheses: Hypothesis[];
}) {
  return (
    <section className="card hypotheses-panel" aria-labelledby="hypotheses-title">
      <p className="eyebrow">Ce que BINTU cherche à vérifier</p>
      <h2 id="hypotheses-title">Hypothèses suivies</h2>
      <ul className="hypothesis-list">
        {hypotheses.map((hypothesis) => (
          <li key={hypothesis.hypothesis_id}>
            <span>{HYPOTHESIS_LABELS[hypothesis.hypothesis_id]}</span>
            <span className={`hypothesis-status hypothesis-${hypothesis.status}`}>
              {STATUS_LABELS[hypothesis.status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
