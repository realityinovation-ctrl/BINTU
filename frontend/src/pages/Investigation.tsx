import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  APIError,
  decisionFailureMessage,
  getInvestigation,
  sendMessage,
} from "../api/client";
import { ErrorState } from "../components/ErrorState";
import { Header } from "../components/Header";
import { HypothesesPanel } from "../components/HypothesesPanel";
import { ImageInput } from "../components/ImageInput";
import { InvestigationFlow } from "../components/InvestigationFlow";
import { InvestigationReport } from "../components/InvestigationReport";
import { LoadingState } from "../components/LoadingState";
import { MeasurementInput } from "../components/MeasurementInput";
import { NextAction } from "../components/NextAction";
import { ProblemCard } from "../components/ProblemCard";
import { Timeline } from "../components/Timeline";
import { VoiceInput } from "../components/VoiceInput";
import type {
  Investigation as InvestigationData,
  PendingAction,
} from "../types/investigation";

interface InvestigationProps {
  id: string;
  initial?: InvestigationData;
  onHome: () => void;
}

function canReply(action: PendingAction | null): boolean {
  return action?.tool_name === "ask_technician";
}

export function Investigation({ id, initial, onHome }: InvestigationProps) {
  const [investigation, setInvestigation] = useState<
    InvestigationData | undefined
  >(initial?.investigation_id === id ? initial : undefined);
  const [loading, setLoading] = useState(!investigation);
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInvestigation(await getInvestigation(id));
    } catch (caught) {
      if (caught instanceof APIError && caught.status === 404) {
        setError({
          title: "Investigation introuvable",
          message:
            "Cette investigation n'existe pas ou n'est plus disponible.",
        });
      } else {
        setError({
          title: "Connexion impossible",
          message:
            "Le backend BINTU ne répond pas. Vérifiez le serveur puis réessayez.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!investigation) void load();
  }, [investigation, load]);

  const knownInstallation = useMemo(
    () =>
      Object.entries(investigation?.state.installation ?? {}).filter(
        ([, value]) => value !== null,
      ),
    [investigation],
  );

  async function deliverAnswer(message: string) {
    if (!message || !investigation) return;
    setSending(true);
    setError(null);
    try {
      setInvestigation(
        await sendMessage(investigation.investigation_id, message),
      );
      setAnswer("");
    } catch (caught) {
      const decisionMessage = decisionFailureMessage(caught);
      const messageText =
        decisionMessage ??
        (caught instanceof APIError && caught.status === 422
          ? "La valeur fournie n'est pas valide pour l'action demandée."
          : "La réponse n'a pas pu être transmise. Vous pouvez réessayer.");
      setError({ title: "Envoi impossible", message: messageText });
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = answer.trim();
    if (message) void deliverAnswer(message);
  }

  if (loading) {
    return (
      <div className="page-shell">
        <Header onHome={onHome} />
        <main className="centered-main">
          <LoadingState />
        </main>
      </div>
    );
  }

  if (!investigation) {
    return (
      <div className="page-shell">
        <Header onHome={onHome} />
        <main className="centered-main">
          <ErrorState
            title={error?.title ?? "Investigation indisponible"}
            message={error?.message ?? "Aucune donnée n'a été reçue."}
            onRetry={load}
          />
        </main>
      </div>
    );
  }

  const { state, status } = investigation;
  const pending = state.pending_action;
  const requestedMeasurement =
    pending?.tool_name === "request_measurement" &&
    typeof pending.arguments.measurement_type === "string" &&
    typeof pending.arguments.location === "string"
      ? {
          type: pending.arguments.measurement_type,
          location: pending.arguments.location,
        }
      : null;

  return (
    <div className="page-shell investigation-page">
      <Header
        status={status}
        investigationId={investigation.investigation_id}
        onHome={onHome}
      />
      <main className="investigation-layout">
        <div className="investigation-main">
          {state.problem ? (
            <ProblemCard description={state.problem.description} />
          ) : (
            <ErrorState
              title="Problème indisponible"
              message="Le backend n'a fourni aucune description du problème."
            />
          )}

          {pending && (
            <NextAction
              action={pending}
              measurementCatalog={state.measurement_catalog}
            />
          )}

          {(status === "completed" ||
            status === "insufficient_information") && (
            <InvestigationReport
              state={state}
              insufficient={status === "insufficient_information"}
            />
          )}

          {error && (
            <ErrorState title={error.title} message={error.message} />
          )}

          {sending && (
            <LoadingState message="BINTU traite les informations envoyées…" />
          )}

          {!sending &&
            status === "waiting_for_technician" &&
            canReply(pending) && (
              <form className="reply-form" onSubmit={submit}>
                <label htmlFor="technician-answer">
                  Votre réponse
                </label>
                <div className="reply-row">
                  <input
                    id="technician-answer"
                    type="text"
                    inputMode="text"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Écrivez votre réponse…"
                    autoComplete="off"
                  />
                  <button
                    className="primary-button send-button"
                    type="submit"
                    disabled={!answer.trim()}
                  >
                    Envoyer
                  </button>
                </div>
                <VoiceInput
                  investigationId={investigation.investigation_id}
                  onUse={(text) => void deliverAnswer(text)}
                />
              </form>
            )}

          {!sending &&
            status === "waiting_for_technician" &&
            requestedMeasurement && (
              <MeasurementInput
                investigationId={investigation.investigation_id}
                catalog={state.measurement_catalog}
                requestedType={requestedMeasurement.type}
                requestedLocation={requestedMeasurement.location}
                onSubmitted={setInvestigation}
              />
            )}

          {!sending &&
            status === "waiting_for_technician" &&
            pending?.tool_name === "analyze_image" && (
              <ImageInput
                investigationId={investigation.investigation_id}
                onAnalyzed={setInvestigation}
              />
            )}

          {!sending &&
            status === "waiting_for_technician" &&
            pending &&
            !canReply(pending) &&
            pending.tool_name !== "analyze_image" &&
            !requestedMeasurement && (
              <div className="unsupported-action" role="status">
                Cette action ne peut pas encore être fournie depuis
                l&apos;interface texte du MVP.
              </div>
            )}

          {!sending && !error && status === "investigating" && !pending && (
            <ErrorState
              title="Décision IA insuffisante"
              message="La décision IA n'a pas permis de poursuivre l'enquête."
            />
          )}

          <InvestigationFlow observations={state.observations} />
          <HypothesesPanel hypotheses={state.hypotheses} />

          <section className="card installation-card">
            <p className="eyebrow">Installation connue</p>
            <h2>Données disponibles</h2>
            {knownInstallation.length === 0 ? (
              <p className="empty-copy">
                Aucune donnée d&apos;installation renseignée.
              </p>
            ) : (
              <dl>
                {knownInstallation.map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replaceAll("_", " ")}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>
        <Timeline events={state.timeline} />
      </main>
    </div>
  );
}
