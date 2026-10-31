import type { InvestigationStateView } from "../types/investigation";
import {
  HYPOTHESIS_STATUS_LABELS,
  hypothesisLabel,
  SOURCE_LABELS,
  measurementLine,
} from "../presentation/labels";
import { HypothesesPanel } from "./HypothesesPanel";
import { Icon } from "./Icons";
import { KnownFacts } from "./KnownFacts";

export function InvestigationReport({
  state,
  insufficient,
  onNew,
}: {
  state: InvestigationStateView;
  insufficient: boolean;
  onNew?: () => void;
}) {
  const conclusion = state.conclusion;
  const cited = (conclusion?.evidence_ids ?? []).map((evidenceId) => {
    const evidence = state.evidence.find((item) => item.id === evidenceId);
    const observation = state.observations.find(
      (item) => item.id === evidence?.observation_id,
    );
    return {
      evidenceId,
      statement: observation?.statement ?? null,
      source: observation ? SOURCE_LABELS[observation.source_type] : null,
    };
  });

  if (insufficient) {
    return (
      <>
      <section className="card state-hero insufficient-hero">
        <div className="state-icon amber">
          <Icon name="info" size={28} />
        </div>
        <p className="eyebrow">Rapport</p>
        <h2 className="state-title">Informations insuffisantes</h2>
        <p className="diagnosis insufficient-diagnosis">
          Informations insuffisantes pour établir un diagnostic fiable.
        </p>
        {onNew && (
          <button className="button primary-button" type="button" onClick={onNew}>
            Nouveau diagnostic
          </button>
        )}
      </section>
      <KnownFacts state={state} citedIds={new Set(conclusion?.evidence_ids ?? [])} />
      <section className="card hypothesis-card">
        <div className="section-heading">
          <span>Hypothèses</span>
        </div>
        <HypothesesPanel
          hypotheses={state.hypotheses}
          domain={state.system.domain}
        />
      </section>
      {conclusion && conclusion.remaining_uncertainties.length > 0 && (
        <section className="card uncertainties">
          <div className="section-heading">
            <span>Informations restantes</span>
          </div>
          <ul className="report-list">
            {conclusion.remaining_uncertainties.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </>
    );
  }

  return (
    <div className="report-layout">
      <main>
        <section className="card conclusion-card">
          <div className="conclusion-icon">
            <Icon name="check" size={24} />
          </div>
          <div>
            <span className="eyebrow">Rapport</span>
            <h2 className="report-title">
              {conclusion?.diagnosis ?? "Diagnostic"}
            </h2>
          </div>
          {conclusion && (
            <div className="confidence">
              <span>Niveau de confiance</span>
              <strong>Confiance fournie : {Math.round(conclusion.confidence * 100)} %</strong>
            </div>
          )}
        </section>
        <section className="card report-section">
          <div className="section-heading">
            <span>Éléments ayant permis le diagnostic</span>
          </div>
          {cited.length === 0 ? (
            <p className="empty-copy">Aucune preuve citée.</p>
          ) : (
            cited.map((item) => (
              <div className="evidence" key={item.evidenceId}>
                {item.source && <span className="evidence-type">{item.source}</span>}
                <span>{item.statement ?? "Preuve citée"}</span>
              </div>
            ))
          )}
        </section>
        <section className="card report-section">
          <div className="section-heading">
            <span>Hypothèses</span>
          </div>
          <ul className="report-list">
            {state.hypotheses.map((hypothesis) => (
              <li key={hypothesis.hypothesis_id}>
                {hypothesisLabel(hypothesis.hypothesis_id, state.system.domain)} :{" "}
                {HYPOTHESIS_STATUS_LABELS[hypothesis.status]}
              </li>
            ))}
          </ul>
        </section>
        <section className="card report-section">
          <div className="section-heading">
            <span>Mesures</span>
          </div>
          {state.measurements.length === 0 ? (
            <p className="empty-copy">Aucune mesure enregistrée.</p>
          ) : (
            <ul className="report-list">
              {state.measurements.map((measurement) => (
                <li key={measurement.id}>
                  {measurementLine(measurement, state.measurement_catalog)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <aside>
        {conclusion && conclusion.remaining_uncertainties.length > 0 && (
          <section className="card uncertainties">
            <div className="section-heading">
              <span>Informations restantes</span>
            </div>
            <ul className="report-list">
              {conclusion.remaining_uncertainties.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
