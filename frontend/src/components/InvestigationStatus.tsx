import type { InvestigationStatus as Status } from "../types/investigation";

const STATUS_LABELS: Record<Status, string> = {
  investigating: "Enquête en cours",
  waiting_for_technician: "En attente de votre réponse",
  completed: "Diagnostic terminé",
  insufficient_information: "Informations insuffisantes",
};

export function InvestigationStatus({ status }: { status: Status }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
