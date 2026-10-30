import type { InvestigationStatus as Status } from "../types/investigation";
import { BrandMark } from "./Icons";
import { InvestigationStatus } from "./InvestigationStatus";

interface HeaderProps {
  status?: Status;
  onHome?: () => void;
}

export function Header({ status, onHome }: HeaderProps) {
  return (
    <header className="app-header">
      <button
        className="brand"
        type="button"
        onClick={onHome}
        aria-label="Retour à l'accueil"
      >
        <BrandMark />
        <span className="brand-word">BINTU</span>
      </button>
      {status && (
        <div className="header-context">
          <InvestigationStatus status={status} />
        </div>
      )}
    </header>
  );
}
