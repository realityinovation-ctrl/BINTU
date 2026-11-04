import {
  entityLabel,
  memoryBackendLabel,
} from "../presentation/assistantLabels";
import type {
  AssistantContext,
  EquipmentDossier,
} from "../types/investigation";
import { Icon } from "./Icons";

interface AssistantMemoryPanelProps {
  context?: AssistantContext | null;
  dossier?: EquipmentDossier | null;
}

function hasContext(context: AssistantContext | null | undefined): boolean {
  if (!context) return false;
  return (
    Object.keys(context.entities ?? {}).length > 0 ||
    Boolean(context.working_summary?.trim()) ||
    (context.long_term_notes?.length ?? 0) > 0 ||
    (context.recent_utterances?.length ?? 0) > 0
  );
}

function hasDossier(dossier: EquipmentDossier | null | undefined): boolean {
  if (!dossier) return false;
  return (
    Boolean(dossier.identified_model) ||
    dossier.composition.length > 0 ||
    dossier.frequent_faults.length > 0 ||
    dossier.lookup_status !== "unavailable"
  );
}

export function AssistantMemoryPanel({
  context,
  dossier,
}: AssistantMemoryPanelProps) {
  const entities = Object.entries(context?.entities ?? {}).sort(([a], [b]) =>
    a.localeCompare(b, "fr"),
  );
  const notes = context?.long_term_notes ?? [];
  const recent = context?.recent_utterances ?? [];
  const summary = context?.working_summary?.trim() ?? "";
  const filled = hasContext(context) || hasDossier(dossier);

  return (
    <section className="card assistant-memory" aria-label="Mémoire assistant">
      <div className="section-heading">
        <span>Mémoire de contexte</span>
        <span className="section-count">
          {memoryBackendLabel(context?.memory_backend)}
          {typeof context?.turn_count === "number" && context.turn_count > 0
            ? ` · ${context.turn_count} tour${context.turn_count > 1 ? "s" : ""}`
            : ""}
        </span>
      </div>
      <p className="assistant-memory-lead">
        Même champ <code>assistant_context</code> que l’app mobile. Désactivation
        serveur : <code>BINTU_ASSISTANT_MEMORY=0</code>.
      </p>

      {!filled ? (
        <p className="empty-copy">
          Aucune entité ni note pour le moment. Elles s’accumulent au fil des
          réponses du technicien.
        </p>
      ) : (
        <div className="assistant-memory-body">
          {summary ? (
            <div className="assistant-block">
              <h3>
                <Icon name="info" size={14} /> Résumé de travail
              </h3>
              <p>{summary}</p>
            </div>
          ) : null}

          {entities.length > 0 ? (
            <div className="assistant-block">
              <h3>
                <Icon name="list" size={14} /> Entités
              </h3>
              <ul className="assistant-entities">
                {entities.map(([key, entity]) => (
                  <li key={key}>
                    <span>{entityLabel(key)}</span>
                    <strong>{entity.value}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {notes.length > 0 ? (
            <div className="assistant-block">
              <h3>
                <Icon name="document" size={14} /> Notes durables
              </h3>
              <ul className="assistant-notes">
                {notes.slice(0, 8).map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {hasDossier(dossier) && dossier ? (
            <div className="assistant-block">
              <h3>
                <Icon name="activity" size={14} /> Dossier équipement
              </h3>
              {dossier.identified_model ? (
                <p>
                  <strong>Modèle :</strong> {dossier.identified_model}
                </p>
              ) : null}
              {dossier.composition.length > 0 ? (
                <p>
                  <strong>Composition :</strong>{" "}
                  {dossier.composition.join(" · ")}
                </p>
              ) : null}
              {dossier.frequent_faults.length > 0 ? (
                <p>
                  <strong>Pannes fréquentes :</strong>{" "}
                  {dossier.frequent_faults.join(" · ")}
                </p>
              ) : null}
              <p className="assistant-dossier-status">
                Statut recherche : {dossier.lookup_status}
              </p>
            </div>
          ) : null}

          {recent.length > 0 ? (
            <details className="assistant-recent">
              <summary>Dernières interventions ({recent.length})</summary>
              <ul>
                {recent
                  .slice(-5)
                  .reverse()
                  .map((line) => (
                    <li key={line}>{line}</li>
                  ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}
