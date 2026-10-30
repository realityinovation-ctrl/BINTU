import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { setSessionTokenGetter, setUnauthorizedHandler } from "./api/client";
import {
  LoadingSession,
  OrganizationRequired,
  SessionExpired,
  SignedOutScreen,
} from "./auth/gate";
import { Diagnostics } from "./pages/Diagnostics";
import { Home } from "./pages/Home";
import { Investigation } from "./pages/Investigation";
import { NewInvestigation } from "./pages/NewInvestigation";
import { PreviewStates, type PreviewKind } from "./pages/PreviewStates";
import { Reports } from "./pages/Reports";
import { SafetyCenter } from "./pages/SafetyCenter";
import { retireLegacySession } from "./session";
import type { Investigation as InvestigationData } from "./types/investigation";

function currentPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

const PREVIEW_KIND: Record<string, PreviewKind> = {
  "informations-insuffisantes": "insufficient",
  chargement: "loading",
  erreur: "error",
};

export default function App() {
  const [path, setPath] = useState(currentPath);
  const [initialInvestigation, setInitialInvestigation] = useState<
    InvestigationData | undefined
  >();
  const [sessionExpired, setSessionExpired] = useState(false);
  const { isLoaded, isSignedIn, orgId, getToken, signOut } = useAuth();

  setSessionTokenGetter(async () => (isSignedIn ? getToken() : null));
  setUnauthorizedHandler(() => setSessionExpired(true));

  useEffect(() => {
    retireLegacySession();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setInitialInvestigation(undefined);
      setPath(currentPath());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(nextPath: string) {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  }

  function goHome() {
    setInitialInvestigation(undefined);
    navigate("/");
  }

  function goDiagnostics() {
    setInitialInvestigation(undefined);
    navigate("/diagnostics");
  }

  function goNew() {
    navigate("/new");
  }

  function openDiagnostic(investigationId: string) {
    setInitialInvestigation(undefined);
    navigate(`/investigations/${investigationId}`);
  }

  if (!isLoaded) return <LoadingSession />;
  if (!isSignedIn) return <SignedOutScreen />;
  if (sessionExpired) {
    return <SessionExpired onReconnect={() => void signOut()} />;
  }
  if (!orgId) return <OrganizationRequired />;

  const navigation = { onHome: goHome, onNew: goNew, onDiagnostics: goDiagnostics };
  let screen = (
    <Home onNew={goNew} onDiagnostics={goDiagnostics} onOpen={openDiagnostic} />
  );

  if (path === "/new") {
    screen = (
      <NewInvestigation
        {...navigation}
        onCreated={(created) => {
          setInitialInvestigation(created);
          navigate(`/investigations/${created.investigation_id}`);
        }}
      />
    );
  } else if (path === "/diagnostics") {
    screen = <Diagnostics {...navigation} onOpen={openDiagnostic} />;
  } else if (path === "/rapports") {
    screen = <Reports {...navigation} onOpen={openDiagnostic} />;
  } else if (path === "/securite") {
    screen = <SafetyCenter {...navigation} />;
  } else {
    const preview = path.match(/^\/apercu\/([^/]+)$/);
    const match = path.match(/^\/investigations\/([^/]+)$/);
    if (preview && PREVIEW_KIND[preview[1]]) {
      screen = <PreviewStates {...navigation} kind={PREVIEW_KIND[preview[1]]} />;
    } else if (match) {
      screen = (
        <Investigation
          id={decodeURIComponent(match[1])}
          initial={initialInvestigation}
          onHome={goHome}
          onDiagnostics={goDiagnostics}
          onNew={goNew}
        />
      );
    }
  }

  return <div key={orgId}>{screen}</div>;
}
