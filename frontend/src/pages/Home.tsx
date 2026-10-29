import { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { listInvestigations, type SavedInvestigation } from "../api/client";

const STATUS_LABELS: Record<string, string> = {
  investigating: "Enquête en cours",
  waiting_for_technician: "En attente de votre réponse",
  completed: "Diagnostic terminé",
  insufficient_information: "Informations insuffisantes",
};

export function Home({
  onNew,
  onOpen,
}: {
  onNew: () => void;
  onOpen: (investigationId: string) => void;
}) {
  const [saved, setSaved] = useState<SavedInvestigation[]>([]);
  const [savedUnavailable, setSavedUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    listInvestigations()
      .then((items) => {
        if (active) setSaved(items);
      })
      .catch(() => {
        if (active) setSavedUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="page-shell home-page">
      <Header />
      <main className="home-main">
        <section className="hero">
          <div className="hero-mark" aria-hidden="true">
            ☀
          </div>
          <p className="eyebrow">Assistant de diagnostic solaire</p>
          <h1>BINTU</h1>
          <p className="hero-tagline">
            L&apos;IA qui enquête avec vous sur vos installations solaires
          </p>
          <p className="hero-description">
            Décrivez un problème, répondez aux questions de BINTU et
            laissez-le guider l&apos;investigation jusqu&apos;au diagnostic.
            BINTU choisit la prochaine vérification utile.
          </p>
          <button className="primary-button hero-cta" type="button" onClick={onNew}>
            Nouvelle investigation
            <span aria-hidden="true">→</span>
          </button>
        </section>
        <section className="principles" aria-label="Principes de BINTU">
          <article>
            <span className="principle-number">01</span>
            <h2>Questions ciblées</h2>
            <p>Chaque demande sert l&apos;investigation en cours.</p>
          </article>
          <article>
            <span className="principle-number">02</span>
            <h2>Hypothèses vérifiées</h2>
            <p>Les pistes restent distinctes des faits observés.</p>
          </article>
          <article>
            <span className="principle-number">03</span>
            <h2>Diagnostic fondé sur les preuves</h2>
            <p>BINTU peut aussi conclure que les informations manquent.</p>
          </article>
        </section>
        <section className="saved-investigations" aria-labelledby="saved-title">
          <h2 id="saved-title">Investigations enregistrées</h2>
          {savedUnavailable ? (
            <p className="empty-copy">
              Les investigations enregistrées ne sont pas disponibles pour
              le moment.
            </p>
          ) : saved.length === 0 ? (
            <p className="empty-copy">
              Aucune investigation enregistrée sur cet appareil.
            </p>
          ) : (
            <ul>
              {saved.map((item) => (
                <li key={item.investigation_id}>
                  <button
                    type="button"
                    onClick={() => onOpen(item.investigation_id)}
                  >
                    <span>{item.problem ?? "Investigation sans problème"}</span>
                    <span>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="central-promise">
          « BINTU ne répond pas seulement. BINTU enquête. »
        </p>
      </main>
    </div>
  );
}
