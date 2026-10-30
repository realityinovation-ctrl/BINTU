import type { InvestigationStatus } from "../types/investigation";
import { Icon } from "./Icons";

const HOME_STEPS = ["Décrire", "Formuler", "Vérifier", "Mettre à jour", "Conclure"];

export function HomeChain() {
  return (
    <ol className="cycle-steps home-chain" aria-label="Déroulé d'un diagnostic">
      {HOME_STEPS.map((label, index) => (
        <li className="cycle-step" key={label}>
          <div className="cycle-marker">{String(index + 1).padStart(2, "0")}</div>
          <div>
            <span>{label}</span>
            <strong>{label}</strong>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function InvestigationCycle({
  hasProblem,
  hasHypothesisMovement,
  status,
}: {
  hasProblem: boolean;
  hasHypothesisMovement: boolean;
  status: InvestigationStatus;
}) {
  const terminal = status === "completed" || status === "insufficient_information";
  const steps: {
    label: string;
    detail: string;
    state: "done" | "active" | "next";
    current?: boolean;
  }[] = [
    {
      label: "Décrire",
      detail: hasProblem ? "Symptôme reçu" : "À décrire",
      state: hasProblem ? "done" : "next",
    },
    {
      label: "Formuler",
      detail: hasHypothesisMovement ? "Hypothèses mises à jour" : "Quatre hypothèses",
      state: hasHypothesisMovement ? "done" : "next",
    },
    {
      label: "Vérifier",
      detail: terminal ? "Vérifications closes" : "Prochaine vérification",
      state: terminal ? "done" : "active",
      current: !terminal,
    },
    {
      label: "Mettre à jour",
      detail: hasHypothesisMovement ? "Statuts actualisés" : "Après la vérification",
      state: terminal ? "done" : "next",
    },
    {
      label: "Conclure",
      detail:
        status === "insufficient_information"
          ? "Informations insuffisantes"
          : status === "completed"
            ? "Diagnostic"
            : "Preuves requises",
      state: terminal ? "active" : "next",
      current: terminal,
    },
  ];

  return (
    <section className="investigation-cycle card" aria-label="Progression du diagnostic">
      <div className="cycle-heading">
        <span>CYCLE DU DIAGNOSTIC</span>
      </div>
      <nav aria-label="Fil du diagnostic">
        <ol className="cycle-steps">
          {steps.map((step, index) => (
            <li
              key={step.label}
              className={`cycle-step ${step.state}`}
              aria-current={step.current ? "step" : undefined}
            >
              <div className="cycle-marker">
                {step.state === "done" ? (
                  <Icon name="check" size={14} />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </div>
              <div>
                <span>
                  {String(index + 1).padStart(2, "0")} · {step.label}
                </span>
                <strong>{step.detail}</strong>
              </div>
            </li>
          ))}
        </ol>
      </nav>
    </section>
  );
}
