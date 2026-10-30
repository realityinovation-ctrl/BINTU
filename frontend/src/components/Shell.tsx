import { useEffect, useRef, useState, type ReactNode } from "react";
import { OrganizationSwitcher, useAuth, useOrganization, useUser } from "@clerk/react";
import { useWaitingCount } from "../attention";
import { BrandMark, Icon, type IconName } from "./Icons";
import { navigateTo } from "../navigation";
import { clearSession } from "../session";

export type ShellScreen =
  | "home"
  | "diagnostics"
  | "new"
  | "diagnostic"
  | "reports"
  | "safety"
  | "insufficient"
  | "loading"
  | "error";

export function Shell({
  active,
  title,
  onNew,
  onHome,
  onDiagnostics,
  children,
}: {
  active: ShellScreen;
  title: string;
  onNew: () => void;
  onHome: () => void;
  onDiagnostics: () => void;
  children: ReactNode;
}) {
  const helpRef = useRef<HTMLDialogElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const topAccountRef = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const { signOut } = useAuth();
  const { user } = useUser();
  const { organization } = useOrganization();
  const waiting = useWaitingCount();
  const name = user?.fullName || "Compte";
  const initials = accountInitials(user?.firstName, user?.lastName, user?.fullName);
  const organizationName = organization?.name || "Organisation";

  useEffect(() => {
    if (!accountOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const inside =
        accountRef.current?.contains(target) || topAccountRef.current?.contains(target);
      if (!inside) setAccountOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [accountOpen]);

  function logout() {
    setAccountOpen(false);
    clearSession();
    void signOut();
    navigateTo("/");
  }

  function openAccountPage(path: string) {
    setAccountOpen(false);
    navigateTo(path);
  }
  const items: {
    id: ShellScreen;
    label: string;
    icon: IconName;
    onClick: () => void;
    current: boolean;
  }[] = [
    {
      id: "diagnostic",
      label: "Diagnostic",
      icon: "activity",
      onClick: onHome,
      current: active === "home" || active === "diagnostic",
    },
    {
      id: "diagnostics",
      label: "Diagnostics",
      icon: "list",
      onClick: onDiagnostics,
      current: active === "diagnostics",
    },
    {
      id: "reports",
      label: "Rapports",
      icon: "document",
      onClick: () => navigateTo("/rapports"),
      current: active === "reports",
    },
    {
      id: "safety",
      label: "Centre de sécurité",
      icon: "shield",
      onClick: () => navigateTo("/securite"),
      current: active === "safety",
    },
  ];
  const demos: { kind: ShellScreen; label: string; icon: IconName; path: string }[] = [
    {
      kind: "insufficient",
      label: "Informations insuffisantes",
      icon: "info",
      path: "/apercu/informations-insuffisantes",
    },
    { kind: "loading", label: "Chargement", icon: "clock", path: "/apercu/chargement" },
    { kind: "error", label: "Erreur", icon: "warning", path: "/apercu/erreur" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={onHome} aria-label="Retour à l'accueil">
          <BrandMark />
          <span className="brand-name">BINTU</span>
        </button>
        <button className="button new-button" type="button" onClick={onNew}>
          <Icon name="plus" />
          Nouveau diagnostic
        </button>
        <nav className="main-nav" aria-label="Navigation principale">
          <span className="nav-kicker">ESPACE DE TRAVAIL</span>
          {items.map((item) => (
            <button
              key={item.id}
              className={`button nav-item ${item.current ? "active" : ""}`}
              type="button"
              aria-current={item.current ? "page" : undefined}
              onClick={item.onClick}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
        <details className="demo-nav">
          <summary>États d'interface</summary>
          {demos.map((item) => (
            <button
              key={item.kind}
              className={`button demo-link ${active === item.kind ? "active" : ""}`}
              type="button"
              onClick={() => navigateTo(item.path)}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </button>
          ))}
        </details>
        <div className="sidebar-account" ref={accountRef}>
          {accountOpen && (
            <div className="account-menu" role="menu" aria-label="Compte">
              <div className="org-switcher">
                <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/" />
              </div>
              <button className="button" type="button" role="menuitem" onClick={() => openAccountPage("/rapports")}>
                <Icon name="document" size={16} />
                Rapports
              </button>
              <button className="button" type="button" role="menuitem" onClick={() => openAccountPage("/securite")}>
                <Icon name="shield" size={16} />
                Centre de sécurité
              </button>
              <button className="button" type="button" role="menuitem" onClick={logout}>
                Se déconnecter
              </button>
            </div>
          )}
          <button
            className="button sidebar-footer"
            type="button"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((open) => !open)}
          >
            <span className="avatar">{initials}</span>
            <span>
              <strong>{name}</strong>
              <span>{organizationName}</span>
            </span>
            <Icon name="chevron" size={17} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="mobile-brand">
            <button className="brand" type="button" onClick={onHome} aria-label="Retour à l'accueil">
              <BrandMark />
              <span className="brand-name">BINTU</span>
            </button>
          </div>
          <div className="topbar-title">{title}</div>
          <div className="topbar-actions">
            <button
              className="button icon-button"
              type="button"
              aria-label="Aide"
              onClick={() => helpRef.current?.showModal()}
            >
              <Icon name="help" />
            </button>
            <button
              className="button icon-button notification"
              type="button"
              aria-label={
                waiting > 0
                  ? `Notifications, ${waiting} diagnostic${waiting > 1 ? "s" : ""} en attente`
                  : "Notifications"
              }
              onClick={onDiagnostics}
            >
              <Icon name="clock" />
              {waiting > 0 && <span className="notif-count">{waiting}</span>}
            </button>
            <div className="top-account" ref={topAccountRef}>
              <button
                className="button topbar-avatar"
                type="button"
                aria-label="Compte"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((open) => !open)}
              >
                {initials}
              </button>
              {accountOpen && (
                <div className="account-menu top" role="menu" aria-label="Compte">
                  <div className="org-switcher">
                    <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/" />
                  </div>
                  <button className="button" type="button" role="menuitem" onClick={() => openAccountPage("/rapports")}>
                    <Icon name="document" size={16} />
                    Rapports
                  </button>
                  <button className="button" type="button" role="menuitem" onClick={() => openAccountPage("/securite")}>
                    <Icon name="shield" size={16} />
                    Centre de sécurité
                  </button>
                  <button className="button" type="button" role="menuitem" onClick={logout}>
                    Se déconnecter
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
      <nav className="mobile-nav" aria-label="Navigation mobile">
        <button className={`button ${active === "home" ? "active" : ""}`} type="button" onClick={onHome}>
          <Icon name="activity" />
          Accueil
        </button>
        <button
          className={`button ${active === "diagnostics" ? "active" : ""}`}
          type="button"
          onClick={onDiagnostics}
        >
          <Icon name="list" />
          Diagnostics
        </button>
        <button className={`button ${active === "new" ? "active" : ""}`} type="button" onClick={onNew}>
          <Icon name="plus" />
          Nouveau diagnostic
        </button>
      </nav>
      <div className="permanent-disclaimer">
        <Icon name="shield" size={14} />
        BINTU est une aide au diagnostic. Il ne remplace pas un technicien qualifié.
      </div>
      <dialog className="help-dialog" ref={helpRef}>
        <h2>Aide</h2>
        <p>
          BINTU est une aide au diagnostic. Il ne remplace pas un technicien qualifié.
          Décrivez les faits observés, puis répondez uniquement à la vérification demandée.
        </p>
        <button className="button primary-button" type="button" onClick={() => helpRef.current?.close()}>
          Fermer
        </button>
      </dialog>
    </div>
  );
}

function accountInitials(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fullName: string | null | undefined,
) {
  const first = firstName?.[0] ?? fullName?.[0] ?? "";
  const last = lastName?.[0] ?? "";
  return `${first}${last}`.toUpperCase() || "·";
}

export function StatusPill({
  kind,
  children,
}: {
  kind: "blue" | "amber" | "green" | "gray" | "red";
  children: ReactNode;
}) {
  const icon: IconName | undefined =
    kind === "green" ? "check" : kind === "amber" ? "clock" : kind === "red" ? "warning" : undefined;
  return (
    <span className={`status status-${kind}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}
