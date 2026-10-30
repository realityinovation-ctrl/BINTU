import { Icon } from "../components/Icons";
import { Shell, StatusPill } from "../components/Shell";
import { navigateTo } from "../navigation";

export type PreviewKind = "insufficient" | "loading" | "error";

const TITLES: Record<PreviewKind, string> = {
  insufficient: "Informations insuffisantes",
  loading: "Chargement",
  error: "Erreur",
};

export function PreviewStates({
  kind,
  onNew,
  onHome,
  onDiagnostics,
}: {
  kind: PreviewKind;
  onNew: () => void;
  onHome: () => void;
  onDiagnostics: () => void;
}) {
  return (
    <Shell
      active={kind}
      title={TITLES[kind]}
      onNew={onNew}
      onHome={onHome}
      onDiagnostics={onDiagnostics}
    >
      <div className="page state-page">
        <div className="fiction-banner">
          <Icon name="info" size={17} />
          Cas fictif. Aucun diagnostic n’est enregistré sur cet écran.
        </div>
        {kind === "insufficient" && (
          <>
            <div className="page-heading">
              <div>
                <div className="breadcrumb">Exemple</div>
                <h1 className="page-title">Informations insuffisantes</h1>
              </div>
              <StatusPill kind="amber">Informations insuffisantes</StatusPill>
            </div>
            <section className="card state-hero insufficient-hero">
              <div className="state-icon amber">
                <Icon name="info" size={28} />
              </div>
              <h2 className="state-title">
                Informations insuffisantes pour établir un diagnostic fiable.
              </h2>
              <p>BINTU ne dispose pas encore de suffisamment d’éléments pour confirmer une cause.</p>
              <p>Ce cas est présenté à titre d’exemple.</p>
              <div className="state-actions">
                <button className="button primary-button" type="button" onClick={onNew}>
                  Nouveau diagnostic
                </button>
                <button className="button secondary-button" type="button" onClick={onDiagnostics}>
                  Revenir à la liste
                </button>
              </div>
            </section>
          </>
        )}
        {kind === "loading" && (
          <>
            <div className="page-heading">
              <div>
                <div className="breadcrumb">Exemple</div>
                <h1 className="page-title">Chargement du diagnostic</h1>
              </div>
            </div>
            <section className="card state-hero loading-hero">
              <div className="spinner" aria-label="Chargement" />
              <h2 className="state-title">Chargement du diagnostic</h2>
              <p>Préparation des informations du diagnostic…</p>
              <div className="notice compact">
                <Icon name="info" />
                <span>Cet écran illustre l’attente. Il ne lance aucune analyse.</span>
              </div>
            </section>
          </>
        )}
        {kind === "error" && (
          <>
            <div className="page-heading">
              <div>
                <div className="breadcrumb">Exemple</div>
                <h1 className="page-title">Erreur</h1>
              </div>
            </div>
            <section className="card state-hero error-hero">
              <div className="state-icon red">
                <Icon name="warning" size={28} />
              </div>
              <h2 className="state-title">Impossible de charger ce diagnostic</h2>
              <p>
                Une erreur est survenue lors du chargement. Aucun nouveau diagnostic n’a été
                créé sur cet écran de démonstration.
              </p>
              <div className="state-actions">
                <button
                  className="button primary-button"
                  type="button"
                  onClick={() => navigateTo("/apercu/chargement")}
                >
                  <Icon name="refresh" />
                  Voir l’écran de chargement
                </button>
                <button className="button secondary-button" type="button" onClick={onDiagnostics}>
                  Revenir à la liste
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
