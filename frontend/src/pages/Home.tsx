import { useEffect, useState } from "react";
import { publishWaitingCount } from "../attention";
import { listInvestigations, type SavedInvestigation } from "../api/client";
import { DiagnosticList, PriorityBanner, priorityDiagnostic } from "../components/DiagnosticList";
import { Icon } from "../components/Icons";
import { LoadingState } from "../components/LoadingState";
import { Shell } from "../components/Shell";

export function Home({
  onNew,
  onOpen,
  onDiagnostics,
}: {
  onNew: () => void;
  onOpen: (investigationId: string) => void;
  onDiagnostics: () => void;
}) {
  const [saved, setSaved] = useState<SavedInvestigation[] | null>(null);
  const [savedUnavailable, setSavedUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    listInvestigations()
      .then((items) => {
        if (!active) return;
        setSaved(items);
        publishWaitingCount(
          items.filter((item) => item.status === "waiting_for_technician").length,
        );
      })
      .catch(() => {
        if (active) setSavedUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const items = saved ?? [];
  const priority = priorityDiagnostic(items);
  const hasDiagnostics = items.length > 0;

  return (
    <Shell
      active={hasDiagnostics ? "diagnostics" : "home"}
      title={hasDiagnostics ? "Diagnostics" : "Accueil"}
      onNew={onNew}
      onHome={() => undefined}
      onDiagnostics={onDiagnostics}
    >
      <div className="page">
        {saved === null && !savedUnavailable ? (
          <LoadingState message="Chargement des diagnostics…" />
        ) : hasDiagnostics ? (
          <>
            <div className="page-heading">
              <div>
                <div className="breadcrumb">Espace de travail</div>
                <h1 className="page-title">Diagnostics</h1>
                <div className="page-meta">
                  Diagnostics enregistrés. Suivez les dossiers ouverts et les actions en attente.
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
            {priority && <PriorityBanner item={priority} onOpen={onOpen} />}
            <section className="card list-card" aria-label="Diagnostics">
              <div className="section-heading">
                <span>À reprendre</span>
                <button className="button text-button" type="button" onClick={onDiagnostics}>
                  Recherche et filtres
                </button>
              </div>
              <DiagnosticList items={items} onOpen={onOpen} />
            </section>
          </>
        ) : (
          <>
        <section className="home-intro">
          <p className="eyebrow">BINTU</p>
          <h1 className="page-title">
            Agent de diagnostic technique multimodal.
          </h1>
          <p className="home-slogan">
            BINTU ne répond pas seulement.{" "}
            <br />
            BINTU enquête.
          </p>
          <p className="home-lead">
            BINTU enquête progressivement sur un problème technique en choisissant
            la meilleure information à demander.
          </p>
          <button className="button primary-button" type="button" onClick={onNew}>
            Nouveau diagnostic
            <Icon name="arrow" />
          </button>
        </section>

        <section className="capability-grid" aria-label="Capacités de BINTU">
          <article className="card capability-card">
            <Icon name="microphone" />
            <h2>Voix</h2>
            <p>Décrire le problème naturellement.</p>
          </article>
          <article className="card capability-card">
            <Icon name="camera" />
            <h2>Image</h2>
            <p>Fournir une photo du système.</p>
          </article>
          <article className="card capability-card">
            <Icon name="activity" />
            <h2>Mesure</h2>
            <p>Ajouter une mesure électrique pour confirmer une hypothèse.</p>
          </article>
        </section>

        <section className="card list-card">
          {savedUnavailable ? (
            <p className="empty-copy">Les diagnostics ne sont pas disponibles pour le moment.</p>
          ) : (
            <div className="empty-state">
              <p className="empty-title">Aucun diagnostic pour le moment</p>
              <p className="empty-copy">Créez votre premier diagnostic pour commencer.</p>
              <button className="button primary-button" type="button" onClick={onNew}>
                Nouveau diagnostic
              </button>
            </div>
          )}
        </section>
          </>
        )}
      </div>
    </Shell>
  );
}
