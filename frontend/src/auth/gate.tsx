import type { ReactNode } from "react";
import { OrganizationList, SignIn } from "@clerk/react";
import { BrandMark } from "../components/Icons";

const clerkAppearance = {
  variables: {
    colorPrimary: "#2f6bff",
    colorText: "#0f1b33",
    colorTextSecondary: "#5b6780",
    colorBackground: "#ffffff",
    colorInputBackground: "#f3f5f9",
    colorInputText: "#0f1b33",
    colorNeutral: "#e3e8f1",
    borderRadius: "8px",
    fontFamily: "Inter, sans-serif",
    fontFamilyButtons: "Inter, sans-serif",
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", boxShadow: "none" },
    card: {
      width: "100%",
      boxShadow: "none",
      border: "1px solid #e3e8f1",
      background: "#ffffff",
    },
    headerTitle: { fontFamily: "Sora, sans-serif", color: "#0a1226" },
    formButtonPrimary: { backgroundColor: "#2f6bff" },
    socialButtonsBlockButton: { borderColor: "#e3e8f1" },
  },
};

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="brand">
            <BrandMark />
            <span className="brand-name">BINTU</span>
          </div>
          <div className="clerk-host">{children}</div>
        </div>
      </section>
      <aside className="login-visual" aria-hidden="true">
        <img src="/login-field.jpg" alt="" />
        <div className="visual-shade" />
        <div className="visual-content">
          <p className="visual-title">BINTU ne répond pas seulement. BINTU enquête.</p>
        </div>
      </aside>
    </main>
  );
}

export function LoadingSession() {
  return (
    <main className="boot-screen">
      <header className="boot-bar">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">BINTU</span>
        </div>
        <span className="boot-index">01 · Session</span>
      </header>
      <section className="boot-module">
        <p className="boot-kicker">Diagnostic technique</p>
        <h1>BINTU ne répond pas seulement. BINTU enquête.</h1>
        <ul className="boot-grid">
          <li><span>01</span>Session</li>
          <li><span>02</span>Organisation</li>
          <li><span>03</span>Diagnostic</li>
        </ul>
      </section>
      <p className="boot-status" role="status">
        <span className="boot-mark" aria-hidden="true" />
        Préparation de votre espace de diagnostic…
      </p>
    </main>
  );
}

export function SignedOutScreen() {
  return (
    <AuthFrame>
      <SignIn routing="hash" appearance={clerkAppearance} />
    </AuthFrame>
  );
}

export function OrganizationRequired() {
  return (
    <AuthFrame>
      <section className="login-panel-copy">
        <h1 className="login-title">Organisation requise</h1>
        <p>
          Choisissez ou créez l’organisation active pour ouvrir les diagnostics.
        </p>
      </section>
      <OrganizationList hidePersonal appearance={clerkAppearance} />
    </AuthFrame>
  );
}

export function SessionExpired({ onReconnect }: { onReconnect: () => void }) {
  return (
    <AuthFrame>
      <section className="login-panel-copy">
        <h1 className="login-title">Session expirée</h1>
        <p>Reconnectez-vous pour continuer. Aucun diagnostic n’est affiché.</p>
        <button className="button primary-button login-submit" type="button" onClick={onReconnect}>
          Se reconnecter
        </button>
      </section>
    </AuthFrame>
  );
}

export function MissingClerkConfiguration() {
  return (
    <AuthFrame>
      <section className="login-panel-copy">
        <h1 className="login-title">Configuration Clerk manquante</h1>
        <p>
          Définissez VITE_CLERK_PUBLISHABLE_KEY dans l’environnement du frontend.
          Cette clé est publique. La clé secrète reste sur le backend.
        </p>
      </section>
    </AuthFrame>
  );
}
