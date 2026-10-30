import { useEffect, useMemo, useState } from "react";
import { publishWaitingCount } from "../attention";
import { listInvestigations, type SavedInvestigation } from "../api/client";
import { DiagnosticList, PriorityBanner, priorityDiagnostic } from "../components/DiagnosticList";
import { Icon } from "../components/Icons";
import { Shell } from "../components/Shell";

type StatusFilter =
  | "all"
  | "waiting_for_technician"
  | "investigating"
  | "completed"
  | "insufficient_information";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "waiting_for_technician", label: "En attente" },
  { id: "investigating", label: "En cours" },
  { id: "completed", label: "Terminés" },
  { id: "insufficient_information", label: "Insuffisants" },
];

export function Diagnostics({
  onNew,
  onHome,
  onOpen,
}: {
  onNew: () => void;
  onHome: () => void;
  onOpen: (investigationId: string) => void;
}) {
  const [saved, setSaved] = useState<SavedInvestigation[]>([]);
  const [savedUnavailable, setSavedUnavailable] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

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

  const priority = priorityDiagnostic(saved);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return saved.filter((item) => {
      const matchesStatus = filter === "all" || item.status === filter;
      const problem = (item.problem ?? "").toLocaleLowerCase("fr");
      return matchesStatus && (needle.length === 0 || problem.includes(needle));
    });
  }, [saved, query, filter]);

  const counts = {
    waiting: saved.filter((item) => item.status === "waiting_for_technician").length,
    ongoing: saved.filter((item) => item.status === "investigating").length,
    done: saved.filter((item) => item.status === "completed").length,
  };

  return (
    <Shell
      active="diagnostics"
      title="Diagnostics"
      onNew={onNew}
      onHome={onHome}
      onDiagnostics={() => undefined}
    >
      <div className="page">
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

        {savedUnavailable ? (
          <p className="empty-copy">Les diagnostics ne sont pas disponibles pour le moment.</p>
        ) : saved.length === 0 ? (
          <section className="card">
            <div className="empty-state">
              <p className="empty-title">Aucun diagnostic pour le moment</p>
              <p className="empty-copy">Créez votre premier diagnostic pour commencer.</p>
              <button className="button primary-button" type="button" onClick={onNew}>
                Nouveau diagnostic
              </button>
            </div>
          </section>
        ) : (
          <>
            {priority && <PriorityBanner item={priority} onOpen={onOpen} />}
            <section className="metrics" aria-label="Répartition des diagnostics chargés">
              <article className="card metric">
                <span>En attente de votre intervention</span>
                <strong>{counts.waiting}</strong>
                <small>Parmi les diagnostics chargés</small>
              </article>
              <article className="card metric">
                <span>Diagnostic en cours</span>
                <strong>{counts.ongoing}</strong>
                <small>Parmi les diagnostics chargés</small>
              </article>
              <article className="card metric">
                <span>Diagnostic terminé</span>
                <strong>{counts.done}</strong>
                <small>Parmi les diagnostics chargés</small>
              </article>
            </section>
            <section className="card list-card">
              <div className="list-toolbar">
                <label className="search-field">
                  <Icon name="search" size={16} />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Rechercher un diagnostic…"
                    aria-label="Rechercher un diagnostic"
                  />
                </label>
                <div className="filter-group" role="group" aria-label="Filtrer par statut">
                  {FILTERS.map((item) => (
                    <button
                      key={item.id}
                      className={`button filter ${filter === item.id ? "active" : ""}`}
                      type="button"
                      aria-pressed={filter === item.id}
                      onClick={() => setFilter(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              {visible.length === 0 ? (
                <p className="empty-copy">Aucun diagnostic ne correspond à cette recherche.</p>
              ) : (
                <DiagnosticList items={visible} onOpen={onOpen} />
              )}
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
