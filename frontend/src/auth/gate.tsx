import { OrganizationList, SignIn } from "@clerk/react";
import { LoadingState } from "../components/LoadingState";

export function LoadingSession() {
  return (
    <main className="login-page">
      <LoadingState message="Vérification de la session…" />
    </main>
  );
}

export function SignedOutScreen() {
  return (
    <main className="login-page">
      <SignIn routing="hash" />
    </main>
  );
}

export function OrganizationRequired() {
  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-panel-inner">
          <h1 className="login-title">Organisation requise</h1>
          <p>
            Choisissez ou créez l’organisation active pour ouvrir les diagnostics.
          </p>
          <OrganizationList hidePersonal />
        </div>
      </section>
    </main>
  );
}

export function SessionExpired({ onReconnect }: { onReconnect: () => void }) {
  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-panel-inner">
          <h1 className="login-title">Session expirée</h1>
          <p>Reconnectez-vous pour continuer. Aucun diagnostic n’est affiché.</p>
          <button className="button primary-button" type="button" onClick={onReconnect}>
            Se reconnecter
          </button>
        </div>
      </section>
    </main>
  );
}

export function MissingClerkConfiguration() {
  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-panel-inner">
          <h1 className="login-title">Configuration Clerk manquante</h1>
          <p>
            Définissez VITE_CLERK_PUBLISHABLE_KEY dans l’environnement du frontend.
            Cette clé est publique. La clé secrète reste sur le backend.
          </p>
        </div>
      </section>
    </main>
  );
}
