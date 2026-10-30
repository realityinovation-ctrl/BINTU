import { STATUS_LABELS } from "../presentation/labels";
import type { InvestigationStatus as Status } from "../types/investigation";

export function InvestigationStatus({ status }: { status: Status }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
