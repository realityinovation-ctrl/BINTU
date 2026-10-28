import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";
import { Investigation } from "./pages/Investigation";
import { makeInvestigation } from "./test/fixtures";
import type {
  Investigation as InvestigationData,
  InvestigationStatus,
} from "./types/investigation";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("parcours principal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  test("crée une investigation, affiche la question et envoie une réponse", async () => {
    const user = userEvent.setup();
    const created = makeInvestigation();
    const afterMessage: InvestigationData = {
      ...created,
      state: {
        ...created.state,
        observations: [
          {
            id: "observation-answer",
            source_type: "technician_answer",
            source_id: "action-1",
            statement: "Aucun code défaut n'est affiché.",
            value: null,
            unit: null,
            certainty: null,
          },
        ],
        pending_action: {
          action_id: "action-2",
          tool_name: "request_measurement",
          arguments: {
            measurement_type: "voltage",
            location: "bornes de la batterie",
            unit: "V",
            distinguishes: ["H2", "H3"],
          },
          reason: "Vérifier la tension réellement disponible.",
        },
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(created, 201))
      .mockResolvedValueOnce(jsonResponse(afterMessage));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /nouvelle investigation/i }),
    );
    await user.type(
      screen.getByLabelText(/problème rencontré/i),
      "La production solaire est anormalement faible.",
    );
    await user.click(
      screen.getByRole("button", { name: /commencer l'investigation/i }),
    );

    expect(
      await screen.findByText("Quel état est affiché par l'onduleur ?"),
    ).toBeInTheDocument();
    expect(screen.getByText(/pourquoi bintu le demande/i)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/votre réponse/i),
      "Aucun code défaut n'est affiché.",
    );
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    expect(
      await screen.findByText("Fournissez la mesure demandée"),
    ).toBeInTheDocument();
    expect(screen.getByText(/bornes de la batterie/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.body).toBe(
      JSON.stringify({
        problem: "La production solaire est anormalement faible.",
      }),
    );
  });

  test("affiche un chargement pendant la récupération", () => {
    window.history.replaceState({}, "", "/investigations/inv-loading");
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));

    render(<App />);

    expect(
      screen.getByText("Chargement de l'investigation…"),
    ).toBeInTheDocument();
  });

  test("affiche une investigation introuvable", async () => {
    window.history.replaceState({}, "", "/investigations/missing");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ detail: "Investigation not found" }, 404),
      ),
    );

    render(<App />);

    expect(
      await screen.findByText("Investigation introuvable"),
    ).toBeInTheDocument();
  });

  test("récupère et affiche une investigation existante", async () => {
    const existing = makeInvestigation();
    window.history.replaceState(
      {},
      "",
      `/investigations/${existing.investigation_id}`,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(existing)),
    );

    render(<App />);

    expect(
      await screen.findByText(
        "La production solaire est anormalement faible.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Hypothèses suivies")).toBeInTheDocument();
  });
});

describe("statuts d'investigation", () => {
  test.each<InvestigationStatus>([
    "investigating",
    "waiting_for_technician",
    "completed",
    "insufficient_information",
  ])("affiche le statut %s sans le réinterpréter", async (status) => {
    const pending = status === "waiting_for_technician" ? undefined : null;
    const investigation = makeInvestigation(status, pending);

    render(
      <Investigation
        id={investigation.investigation_id}
        initial={investigation}
        onHome={() => undefined}
      />,
    );

    const expected = {
      investigating: "Enquête en cours",
      waiting_for_technician: "En attente de votre réponse",
      completed: "Diagnostic terminé",
      insufficient_information: "Informations insuffisantes",
    }[status];
    await waitFor(() =>
      expect(screen.getAllByText(expected).length).toBeGreaterThan(0),
    );
    if (status === "insufficient_information") {
      expect(
        screen.getByText(/ne possède pas assez d'éléments vérifiés/i),
      ).toBeInTheDocument();
    }
  });
});
