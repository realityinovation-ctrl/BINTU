import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import App from "../App";
import { clerkState } from "../test/setup";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

test("n'appelle pas l'API pendant le chargement de la session", () => {
  clerkState.isLoaded = false;
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  expect(
    screen.getByRole("heading", { name: "Vérification de la session…" }),
  ).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("affiche la connexion Clerk sans appeler l'API", () => {
  clerkState.isSignedIn = false;
  clerkState.orgId = null;
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  expect(screen.getByRole("heading", { name: "Connexion" })).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("exige une organisation active avant les diagnostics", () => {
  clerkState.orgId = null;
  clerkState.orgName = null;
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  expect(
    screen.getByRole("heading", { name: "Organisation requise" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Choisir une organisation")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("affiche le compte Clerk et envoie le jeton Bearer", async () => {
  sessionStorage.setItem(
    "bintu-session",
    JSON.stringify({ email: "a@b.c", name: "A", initials: "A" }),
  );
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  expect(screen.getByText("Marc Laurent")).toBeInTheDocument();
  expect(screen.getByText("BINTU Demo")).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock.mock.calls[0][1]?.headers?.Authorization).toBe(
    "Bearer test-session-token",
  );
  expect(sessionStorage.getItem("bintu-session")).toBeNull();
});

test("la déconnexion appelle Clerk", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

  render(<App />);
  await user.click(screen.getByRole("button", { name: "Compte" }));
  await user.click(screen.getAllByRole("menuitem", { name: "Se déconnecter" })[0]);

  expect(clerkState.signOut).toHaveBeenCalled();
});

test("une réponse 401 retire les diagnostics", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    jsonResponse({ detail: "secret sk_test_hidden" }, 401),
  );
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);

  expect(
    await screen.findByRole("heading", { name: "Session expirée" }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/sk_test_hidden/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Diagnostics enregistrés/)).not.toBeInTheDocument();
});
