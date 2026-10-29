import { useEffect, useState } from "react";
import { Home } from "./pages/Home";
import { Investigation } from "./pages/Investigation";
import { NewInvestigation } from "./pages/NewInvestigation";
import type { Investigation as InvestigationData } from "./types/investigation";

function currentPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

export default function App() {
  const [path, setPath] = useState(currentPath);
  const [initialInvestigation, setInitialInvestigation] = useState<
    InvestigationData | undefined
  >();

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

  if (path === "/new") {
    return (
      <NewInvestigation
        onHome={goHome}
        onCreated={(created) => {
          setInitialInvestigation(created);
          navigate(`/investigations/${created.investigation_id}`);
        }}
      />
    );
  }

  const match = path.match(/^\/investigations\/([^/]+)$/);
  if (match) {
    return (
      <Investigation
        id={decodeURIComponent(match[1])}
        initial={initialInvestigation}
        onHome={goHome}
      />
    );
  }

  return (
    <Home
      onNew={() => navigate("/new")}
      onOpen={(investigationId) => {
        setInitialInvestigation(undefined);
        navigate(`/investigations/${investigationId}`);
      }}
    />
  );
}
