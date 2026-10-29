import type { InvestigationStatus as Status } from "../types/investigation";
import { InvestigationStatus } from "./InvestigationStatus";

interface HeaderProps {
  status?: Status;
  investigationId?: string;
  onHome?: () => void;
}

export function Header({ status, investigationId, onHome }: HeaderProps) {
  return (
    <header className="app-header">
      <button
        className="brand"
        type="button"
        onClick={onHome}
        aria-label="Retour à l'accueil"
      >
        <span className="brand-sun" aria-hidden="true">
          ☀
        </span>
        <span>BINTU</span>
      </button>
      {status && (
        <div className="header-context">
          <InvestigationStatus status={status} />
          {investigationId && (
            <span className="short-id" title={investigationId}>
              #{investigationId.slice(0, 8)}
            </span>
          )}
        </div>
      )}
    </header>
  );
}
