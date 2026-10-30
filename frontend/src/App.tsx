import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { setSessionTokenGetter, setUnauthorizedHandler } from "./api/client";
import {
  LoadingSession,
  OrganizationRequired,
  SessionExpired,
  SignedOutScreen,
} from "./auth/gate";
import { Home } from "./pages/Home";
import { Investigation } from "./pages/Investigation";
import { NewInvestigation } from "./pages/NewInvestigation";
import { retireLegacySession } from "./session";
import type { Investigation as InvestigationData } from "./types/investigation";

function currentPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

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

  if (!isLoaded) return <LoadingSession />;
  if (!isSignedIn) return <SignedOutScreen />;
  if (sessionExpired) {
    return <SessionExpired onReconnect={() => void signOut()} />;
  }
  if (!orgId) return <OrganizationRequired />;

  if (path === "/new") {
    return (
      <div key={orgId}>
        <NewInvestigation
          onHome={goHome}
          onCreated={(created) => {
            setInitialInvestigation(created);
            navigate(`/investigations/${created.investigation_id}`);
          }}
        />
      </div>
    );
  }

  const match = path.match(/^\/investigations\/([^/]+)$/);
  if (match) {
    return (
      <div key={orgId}>
        <Investigation
          id={decodeURIComponent(match[1])}
          initial={initialInvestigation}
          onHome={goHome}
        />
      </div>
    );
  }

  return (
    <div key={orgId}>
      <Home
        onNew={() => navigate("/new")}
        onOpen={(investigationId) => {
          setInitialInvestigation(undefined);
          navigate(`/investigations/${investigationId}`);
        }}
      />
    </div>
  );
}
