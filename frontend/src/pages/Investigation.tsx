import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import {
  APIError,
  decisionFailureMessage,
  getInvestigation,
  sendMessage,
} from "../api/client";
import { ErrorState } from "../components/ErrorState";
import { HypothesesPanel } from "../components/HypothesesPanel";
import { Icon } from "../components/Icons";
import { ImageInput } from "../components/ImageInput";
import { InvestigationCycle } from "../components/InvestigationSpine";
import { InvestigationReport } from "../components/InvestigationReport";
import { KnownFacts } from "../components/KnownFacts";
import { LoadingState } from "../components/LoadingState";
import { MeasurementInput } from "../components/MeasurementInput";
import { Shell, StatusPill } from "../components/Shell";
import { VoiceInput } from "../components/VoiceInput";
import {
  STATUS_KIND,
  STATUS_LABELS,
  characteristicEntries,
  citedEvidenceIds,
  distinguishesLabels,
  gestureFor,
  humanizeTimelineSummary,
  presentReason,
  systemTitle,
} from "../presentation/labels";
import type {
  Investigation as InvestigationData,
  PendingAction,
} from "../types/investigation";

interface InvestigationProps {
  id: string;
  initial?: InvestigationData;
  onHome: () => void;
  onDiagnostics?: () => void;
  onNew?: () => void;
}

function canReply(action: PendingAction | null): boolean {
  return action?.tool_name === "ask_technician";
}

function requestedTitle(toolName: string, gesture: string | null): string {
  if (gesture) return gesture;
  if (toolName === "ask_technician") return "Décrivez ce que vous observez.";
  if (toolName === "request_measurement") return "Mesurez la tension demandée par BINTU.";
  if (toolName === "analyze_image") return "Prenez une photo de la zone concernée.";
  return "BINTU a besoin d'une vérification";
}

export function Investigation({
  id,
  initial,
  onHome,
  onDiagnostics = () => undefined,
  onNew = () => undefined,
}: InvestigationProps) {
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
          title: "Diagnostic introuvable",
          message: "Ce diagnostic n'existe pas ou n'est plus disponible.",
        });
      } else {
        setError({
          title: "Connexion impossible",
          message: "Le backend BINTU ne répond pas. Vérifiez le serveur puis réessayez.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!investigation) void load();
  }, [investigation, load]);

  async function deliverAnswer(message: string) {
    if (!message || !investigation) return;
    setSending(true);
    setError(null);
    try {
      setInvestigation(await sendMessage(investigation.investigation_id, message));
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

  const shell = (content: ReactNode) => (
    <Shell
      active="diagnostic"
      title="Diagnostic"
      onNew={onNew}
      onHome={onHome}
      onDiagnostics={onDiagnostics}
    >
      {content}
    </Shell>
  );

  if (loading) {
    return shell(
      <main className="page">
        <LoadingState />
      </main>,
    );
  }

  if (!investigation) {
    return shell(
      <main className="page">
        <ErrorState
          title={error?.title ?? "Diagnostic indisponible"}
          message={error?.message ?? "Aucune donnée n'a été reçue."}
          onRetry={load}
        />
      </main>,
    );
  }

  const { state, status } = investigation;
  const pending = state.pending_action;
  const terminal = status === "completed" || status === "insufficient_information";
  const requestedMeasurement =
    pending?.tool_name === "request_measurement" &&
    typeof pending.arguments.measurement_type === "string" &&
    typeof pending.arguments.location === "string"
      ? {
          type: pending.arguments.measurement_type,
          location: pending.arguments.location,
        }
      : null;
  const gesture = pending ? gestureFor(pending, state.measurement_catalog) : null;
  const distinguished = pending
    ? distinguishesLabels(pending.arguments.distinguishes, state.system.domain)
    : [];
  const characteristics = characteristicEntries(state.system.characteristics);
  const citedIds = citedEvidenceIds(state.conclusion?.evidence_ids);
  const hasHypothesisMovement = state.hypotheses.some(
    (hypothesis) => hypothesis.status !== "unexplored",
  );

  return shell(
    <div className="page investigation-page">
      <div className="page-heading">
        <div>
          <div className="breadcrumb">Diagnostic</div>
          <h1 className="page-title">
            {state.problem?.description ?? "Diagnostic"}
          </h1>
        </div>
        <div className="heading-actions">
          <StatusPill kind={STATUS_KIND[status]}>{STATUS_LABELS[status]}</StatusPill>
        </div>
      </div>

      <div className="asset-context">
        <div className="asset-symbol">
          <Icon name="bolt" size={19} />
        </div>
        <div className="asset-name">
          <span>Système diagnostiqué</span>
          <strong>{systemTitle(state.system)}</strong>
        </div>
        {characteristics.slice(0, 3).map((item) => (
          <div className="asset-data" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <section className="investigation-overview" aria-label="Synthèse du diagnostic">
        <div className="overview-intro">
          <div className="overview-eyebrow">
            <span className="live-dot" />
            {STATUS_LABELS[status]}
          </div>
          <h2 className="overview-title">
            BINTU ne répond pas seulement.
            <br />
            BINTU enquête.
          </h2>
          <p>
            Chaque conclusion doit être soutenue par une observation, une image ou une mesure fournie par le technicien.
          </p>
        </div>
        <div className="overview-grid">
          <div className="overview-item">
            <span className="overview-number">01</span>
            <div>
              <span>Ce que l’on sait</span>
              <strong>
                {state.observations.length} information
                {state.observations.length > 1 ? "s" : ""} enregistrée
                {state.observations.length > 1 ? "s" : ""}
              </strong>
            </div>
            <Icon name="check" size={17} />
          </div>
          <div className={`overview-item ${pending ? "missing" : ""}`}>
            <span className="overview-number">02</span>
            <div>
              <span>Ce qui manque</span>
              <strong>
                {pending?.tool_name === "ask_technician"
                  ? "Une réponse du technicien"
                  : pending?.tool_name === "request_measurement"
                    ? "Une mesure"
                    : pending?.tool_name === "analyze_image"
                      ? "Une photo"
                      : terminal
                        ? "Aucune action en attente"
                        : "Une décision utilisable"}
              </strong>
            </div>
            <Icon name="help" size={17} />
          </div>
          <div className={`overview-item ${pending ? "next" : ""}`}>
            <span className="overview-number">03</span>
            <div>
              <span>Prochaine vérification</span>
              <strong>
                {pending?.tool_name === "ask_technician"
                  ? "Question au technicien"
                  : pending?.tool_name === "request_measurement"
                    ? "Mesure demandée"
                    : pending?.tool_name === "analyze_image"
                      ? "Analyse de l’image"
                      : STATUS_LABELS[status]}
              </strong>
            </div>
            <Icon name="bolt" size={17} />
          </div>
          <div className="overview-item">
            <span className="overview-number">04</span>
            <div>
              <span>Pourquoi</span>
              <strong>{pending?.reason ? "Raison fournie avec l’action" : "Aucune raison fournie"}</strong>
            </div>
            <Icon name="activity" size={17} />
          </div>
        </div>
      </section>

      <InvestigationCycle
        hasProblem={Boolean(state.problem?.description)}
        hasHypothesisMovement={hasHypothesisMovement}
        status={status}
      />

      {terminal ? (
        <div className="diagnostic-result">
          <InvestigationReport
            state={state}
            insufficient={status === "insufficient_information"}
            onNew={onNew}
          />
        </div>
      ) : (
        <div className="workspace-grid">
          <main className="workspace-main">
            <section className="summary-card card">
              <div className="section-heading">
                <span>Ce que BINTU sait</span>
                <StatusPill kind="blue">
                  {state.observations.length} élément
                  {state.observations.length > 1 ? "s" : ""}
                </StatusPill>
              </div>
              <div className="summary-content">
                <div className="summary-icon">
                  <Icon name="info" />
                </div>
                <div>
                  <h2 className="card-title">Informations enregistrées</h2>
                  <p>Observations, réponses, analyses d’image et mesures restent distinctes.</p>
                </div>
              </div>
              <KnownFacts state={state} citedIds={citedIds} />
            </section>

            <section className="card hypothesis-card">
              <div className="section-heading">
                <span>Hypothèses</span>
                <span className="section-count">{state.hypotheses.length} familles</span>
              </div>
              <HypothesesPanel hypotheses={state.hypotheses} domain={state.system.domain} />
            </section>
          </main>

          <aside className="workspace-side">
            {pending ? (
              <section className="next-check card">
                <div className="next-label">
                  <Icon name="bolt" size={16} />
                  Ce que BINTU vous demande
                </div>
                <h2 className="next-title">{requestedTitle(pending.tool_name, gesture)}</h2>
                {pending.reason && (
                  <>
                    <h3 className="why-heading">Pourquoi</h3>
                    <p className="next-reason">{presentReason(pending.reason)}</p>
                  </>
                )}
                {distinguished.length > 0 && (
                  <div className="distinguish">
                    <Icon name="activity" size={17} />
                    <span>Cette action distingue</span>
                    <ul className="distinguish-names" aria-label="Hypothèses distinguées">
                      {distinguished.map((label) => (
                        <li key={label}>
                          <strong>{label}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="validation-badge">
                  <Icon name="shield" size={15} />
                  <div>
                    <strong>Décision retenue par BINTU</strong>
                    <span>Cette action est celle demandée pour poursuivre le diagnostic.</span>
                  </div>
                </div>
                {requestedMeasurement && (
                  <div className="safety-note">
                    <Icon name="shield" size={20} />
                    <div>
                      <strong>Consigne pour le technicien habilité</strong>
                      <span>
                        Mesure en fonctionnement, par une personne habilitée. N’ouvrez aucun capot et ne déconnectez aucun conducteur.
                      </span>
                    </div>
                  </div>
                )}
                {error && <ErrorState title={error.title} message={error.message} />}
                {sending && <LoadingState message="BINTU traite les informations envoyées…" />}
                {!sending && status === "waiting_for_technician" && canReply(pending) && (
                  <form className="reply-form" onSubmit={submit}>
                    <label htmlFor="technician-answer">Réponse</label>
                    <textarea
                      id="technician-answer"
                      className="text-input textarea"
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder="Écrivez la vérification demandée…"
                      rows={4}
                      autoComplete="off"
                    />
                    <div className="reply-actions">
                      <button className="button primary-button" type="submit" disabled={!answer.trim()}>
                        Répondre
                      </button>
                      <VoiceInput
                        investigationId={investigation.investigation_id}
                        onUse={(text) => void deliverAnswer(text)}
                      />
                    </div>
                  </form>
                )}
                {!sending && status === "waiting_for_technician" && requestedMeasurement && (
                  <MeasurementInput
                    investigationId={investigation.investigation_id}
                    catalog={state.measurement_catalog}
                    requestedType={requestedMeasurement.type}
                    requestedLocation={requestedMeasurement.location}
                    onSubmitted={setInvestigation}
                  />
                )}
                {!sending && status === "waiting_for_technician" && pending.tool_name === "analyze_image" && (
                  <ImageInput
                    investigationId={investigation.investigation_id}
                    onAnalyzed={setInvestigation}
                  />
                )}
                {!sending &&
                  status === "waiting_for_technician" &&
                  !canReply(pending) &&
                  pending.tool_name !== "analyze_image" &&
                  !requestedMeasurement && (
                    <div className="unsupported-action" role="status">
                      Cette action ne peut pas encore être fournie depuis l'interface.
                    </div>
                  )}
              </section>
            ) : (
              <section className="card next-check">
                {state.problem && <p>{state.problem.description}</p>}
                {error && <ErrorState title={error.title} message={error.message} />}
                {!sending && !error && status === "investigating" && (
                  <ErrorState
                    title="Décision IA insuffisante"
                    message="La décision n'a pas permis de poursuivre le diagnostic."
                  />
                )}
              </section>
            )}

            <section className="card timeline-card">
              <div className="section-heading">
                <span>Chronologie</span>
              </div>
              {state.timeline.length === 0 ? (
                <p className="empty-copy">Aucune étape enregistrée.</p>
              ) : (
                <div className="timeline">
                  {state.timeline.map((event) => (
                    <div className="timeline-item done" key={event.sequence}>
                      <span className="timeline-dot">
                        <Icon name="check" size={12} />
                      </span>
                      <div>
                        <strong>{humanizeTimelineSummary(event.summary, state.system.domain)}</strong>
                        <time>Étape {event.sequence}</time>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>,
  );
}
