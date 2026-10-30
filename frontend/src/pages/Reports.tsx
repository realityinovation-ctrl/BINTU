import { useEffect, useState } from "react";
import { listInvestigations, type SavedInvestigation } from "../api/client";
import { DiagnosticList } from "../components/DiagnosticList";
import { Icon } from "../components/Icons";
import { Shell } from "../components/Shell";

export function Reports({
  onNew,
  onHome,
  onDiagnostics,
  onOpen,
}: {
  onNew: () => void;
  onHome: () => void;
  onDiagnostics: () => void;
  onOpen: (investigationId: string) => void;
}) {
  const [saved, setSaved] = useState<SavedInvestigation[]>([]);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    listInvestigations()
      .then((items) => {
        if (active) setSaved(items);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const reports = saved.filter(
    (item) => item.status === "completed" || item.status === "insufficient_information",
  );

  return (
    <Shell
      active="reports"
      title="Rapports"
      onNew={onNew}
      onHome={onHome}
      onDiagnostics={onDiagnostics}
    >
      <div className="page">
        <div className="page-heading">
          <div>
            <div className="breadcrumb">Espace de travail</div>
            <h1 className="page-title">Rapports</h1>
            <div className="page-meta">
              Relisez les diagnostics terminés et les dossiers restés sans conclusion.
            </div>
            <p className="demo-note">
              Données disponibles dans cet environnement de démonstration.
            </p>
          </div>
          <button className="button primary-button" type="button" onClick={onNew}>
            <Icon name="plus" />
            Nouveau diagnostic
          </button>
        </div>
        {unavailable ? (
          <p className="empty-copy">Les rapports ne sont pas disponibles pour le moment.</p>
        ) : reports.length === 0 ? (
          <section className="card">
            <div className="empty-state">
              <p className="empty-title">Aucun rapport pour le moment</p>
              <p className="empty-copy">
                Un rapport apparaît ici lorsqu’un diagnostic est terminé ou lorsque les
                informations restent insuffisantes.
              </p>
              <button className="button secondary-button" type="button" onClick={onDiagnostics}>
                Voir les diagnostics
              </button>
            </div>
          </section>
        ) : (
          <section className="card list-card" aria-label="Rapports disponibles">
            <div className="section-heading">
              <span>Diagnostics clos</span>
              <span className="section-count">{reports.length}</span>
            </div>
            <DiagnosticList items={reports} onOpen={onOpen} />
          </section>
        )}
      </div>
    </Shell>
  );
}
