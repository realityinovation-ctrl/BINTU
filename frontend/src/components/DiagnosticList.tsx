import type { SavedInvestigation } from "../api/client";
import { Icon } from "./Icons";
import { STATUS_KIND, statusLabel } from "../presentation/labels";
import type { InvestigationStatus } from "../types/investigation";
import { StatusPill } from "./Shell";

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} j`;
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function priorityDiagnostic(items: SavedInvestigation[]) {
  return items.find((item) => item.status === "waiting_for_technician");
}

export function PriorityBanner({
  item,
  onOpen,
}: {
  item: SavedInvestigation;
  onOpen: (investigationId: string) => void;
}) {
  return (
    <section className="resume-investigation resume-known">
      <div className="resume-icon">
        <Icon name="bolt" />
      </div>
      <div className="resume-copy">
        <span>Action prioritaire</span>
        <h2>{item.problem ?? "Diagnostic sans problème décrit"}</h2>
        <p>{statusLabel(item.status)}</p>
      </div>
      <button className="button primary-button" type="button" onClick={() => onOpen(item.investigation_id)}>
        Reprendre
        <Icon name="arrow" />
      </button>
    </section>
  );
}

function kindFor(status: string) {
  if (status in STATUS_KIND) return STATUS_KIND[status as InvestigationStatus];
  return "gray" as const;
}

export function DiagnosticList({
  items,
  onOpen,
}: {
  items: SavedInvestigation[];
  onOpen: (investigationId: string) => void;
}) {
  return (
    <div className="case-list">
      {items.map((item) => (
        <button
          className="button case-row diagnostic-row"
          type="button"
          key={item.investigation_id}
          onClick={() => onOpen(item.investigation_id)}
        >
          <div className="case-main">
            <strong>{item.problem ?? "Diagnostic sans problème décrit"}</strong>
          </div>
          <StatusPill kind={kindFor(item.status)}>{statusLabel(item.status)}</StatusPill>
          <time>{formatWhen(item.updated_at)}</time>
          <span className="open-label">Ouvrir</span>
        </button>
      ))}
    </div>
  );
}
