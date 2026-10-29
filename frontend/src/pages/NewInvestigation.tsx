import { FormEvent, useState } from "react";
import { createInvestigation, decisionFailureMessage } from "../api/client";
import { ErrorState } from "../components/ErrorState";
import { Header } from "../components/Header";
import { LoadingState } from "../components/LoadingState";
import type { Investigation } from "../types/investigation";

interface NewInvestigationProps {
  onHome: () => void;
  onCreated: (investigation: Investigation) => void;
}

export function NewInvestigation({
  onHome,
  onCreated,
}: NewInvestigationProps) {
  const [problem, setProblem] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const description = problem.trim();
    if (!description) return;
    setSubmitting(true);
    setError(null);
    try {
      onCreated(await createInvestigation(description));
    } catch (caught) {
      setError(
        decisionFailureMessage(caught) ??
          "Impossible de créer l'investigation. Vérifiez que le backend est disponible.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="page-shell">
      <Header onHome={onHome} />
      <main className="form-page">
        <button className="back-button" type="button" onClick={onHome}>
          ← Retour
        </button>
        <div className="form-intro">
          <p className="eyebrow">Démarrer</p>
          <h1>Nouvelle investigation</h1>
          <p>
            Décrivez le problème rencontré sur votre installation solaire.
          </p>
        </div>
        {submitting ? (
          <LoadingState message="BINTU démarre l'investigation…" />
        ) : (
          <form className="problem-form" onSubmit={submit}>
            <label htmlFor="problem">Problème rencontré</label>
            <textarea
              id="problem"
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
              placeholder="Exemple : ma production est beaucoup plus faible que d'habitude…"
              rows={7}
              autoFocus
              required
            />
            <p className="field-help">
              Décrivez uniquement ce que vous observez. Vous pourrez préciser
              les détails ensuite.
            </p>
            {error && (
              <ErrorState
                title="Création impossible"
                message={error}
                onRetry={() => setError(null)}
              />
            )}
            <button
              className="primary-button full-width"
              type="submit"
              disabled={!problem.trim()}
            >
              Commencer l&apos;investigation
              <span aria-hidden="true">→</span>
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
