import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";
import { startWavRecording } from "./audio/recorder";
import { Investigation } from "./pages/Investigation";
import { makeInvestigation } from "./test/fixtures";
import type {
  Investigation as InvestigationData,
  InvestigationStatus,
} from "./types/investigation";

vi.mock("./audio/recorder", () => ({
  startWavRecording: vi.fn(),
}));

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

async function launchInvestigation(
  user: ReturnType<typeof userEvent.setup>,
  problem: string,
) {
  if (!screen.queryByLabelText(/décrivez précisément ce que vous constatez/i)) {
    await user.click(
      screen.getAllByRole("button", { name: /nouveau diagnostic/i })[0],
    );
  }
  await user.type(
    screen.getByLabelText(/décrivez précisément ce que vous constatez/i),
    problem,
  );
  for (let step = 0; step < 3; step += 1) {
    const continuer = screen.queryByRole("button", { name: /^Continuer$/ });
    if (!continuer) break;
    await user.click(continuer);
  }
  const start = screen.queryByRole("button", { name: /démarrer le diagnostic/i });
  if (start) await user.click(start);
}

describe("parcours principal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(startWavRecording).mockReset();
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
            measurement_type: "dc_voltage",
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
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(created, 201))
      .mockResolvedValueOnce(jsonResponse(afterMessage));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await launchInvestigation(user, "La production solaire est anormalement faible.");

    expect(
      await screen.findByText("Quel état est affiché par l'onduleur ?"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Pourquoi" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Hypothèses distinguées" }),
    ).toHaveTextContent("Chaîne électrique");
    expect(
      screen.getByRole("listitem", { current: "step" }),
    ).toHaveTextContent("Prochaine vérification");

    await user.type(
      screen.getByLabelText("Réponse"),
      "Aucun code défaut n'est affiché.",
    );
    await user.click(screen.getByRole("button", { name: "Répondre" }));

    expect(
      await screen.findByText("Vérifier la tension réellement disponible."),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/bornes de la batterie/i).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][1]?.body).toBe(
      JSON.stringify({
        problem: "Production faible — La production solaire est anormalement faible.",
      }),
    );
  });

  test("affiche un chargement pendant la récupération", () => {
    window.history.replaceState({}, "", "/investigations/inv-loading");
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));

    render(<App />);

    expect(
      screen.getByText("Chargement du diagnostic…"),
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
      await screen.findByText("Diagnostic introuvable"),
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
    expect(
      screen.getByRole("navigation", { name: "Fil du diagnostic" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Hypothèses").length).toBeGreaterThan(0);
  });

  test("ne transmet la transcription qu'après confirmation", async () => {
    const user = userEvent.setup();
    const created = makeInvestigation();
    const afterMessage = {
      ...created,
      state: {
        ...created.state,
        observations: [
          {
            id: "voice-answer",
            source_type: "technician_answer" as const,
            source_id: "action-1",
            statement: "Aucun défaut affiché après vérification.",
            value: null,
            unit: null,
            certainty: null,
          },
        ],
      },
    };
    vi.mocked(startWavRecording).mockResolvedValue({
      stop: vi
        .fn()
        .mockResolvedValue(new Blob(["wav"], { type: "audio/wav" })),
      cancel: vi.fn().mockResolvedValue(undefined),
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(created, 201))
      .mockResolvedValueOnce(
        jsonResponse({ transcription: "Aucun défaut affiché." }),
      )
      .mockResolvedValueOnce(jsonResponse(afterMessage));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await launchInvestigation(user, "Production solaire faible.");
    await screen.findByText("Quel état est affiché par l'onduleur ?");

    await user.click(screen.getByRole("button", { name: /parler/i }));
    await user.click(
      await screen.findByRole("button", { name: /enregistrement.*arrêter/i }),
    );

    const transcription = await screen.findByLabelText(
      "Transcription à vérifier",
    );
    expect(transcription).toHaveValue("Aucun défaut affiché.");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2][0])).toContain("/transcribe");

    await user.clear(transcription);
    await user.type(
      transcription,
      "Aucun défaut affiché après vérification.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await user.click(
      screen.getByRole("button", { name: "Utiliser cette réponse" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(String(fetchMock.mock.calls[3][0])).toContain("/message");
    expect(fetchMock.mock.calls[3][1]?.body).toBe(
      JSON.stringify({
        message: "Aucun défaut affiché après vérification.",
      }),
    );
  });

  test("prévisualise puis analyse une image uniquement après confirmation", async () => {
    const user = userEvent.setup();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:panel-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const pendingImage = {
      ...makeInvestigation(),
      state: {
        ...makeInvestigation().state,
        pending_action: {
          action_id: "action-1",
          tool_name: "analyze_image" as const,
          arguments: {
            image_id: "image-action-1",
            focus: "Vérifier les obstructions visibles.",
            distinguishes: ["H1", "H2"],
          },
          reason: "Rechercher un indice visuel.",
        },
      },
    };
    const afterAnalysis: InvestigationData = {
      ...pendingImage,
      state: {
        ...pendingImage.state,
        observations: [
          {
            id: "observation:image-analysis-1",
            source_type: "image_analysis",
            source_id: "image-action-1",
            statement:
              "Une partie du panneau semble couverte par des dépôts visibles.",
            value: null,
            unit: null,
            certainty: 0.76,
          },
        ],
        pending_action: {
          action_id: "action-2",
          tool_name: "ask_technician",
          arguments: {
            question: "Une autre zone est-elle masquée ?",
            distinguishes: ["H1", "H2"],
          },
          reason: "Poursuivre la vérification.",
        },
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(afterAnalysis));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Investigation
        id={pendingImage.investigation_id}
        initial={pendingImage}
        onHome={() => undefined}
      />,
    );

    const file = new File(["image"], "panneau.png", {
      type: "image/png",
    });
    await user.upload(
      screen.getByLabelText(/prendre une photo/i),
      file,
    );

    expect(
      screen.getByAltText("Aperçu de la photo sélectionnée"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Supprimer" }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Analyser avec BINTU" }),
    );

    expect(
      await screen.findByText(
        "Une partie du panneau semble couverte par des dépôts visibles.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Image").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/image");
    expect(fetchMock.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
  });

  test("saisit une mesure du catalogue, affiche l'unité et la persiste", async () => {
    const user = userEvent.setup();
    const requested = {
      ...makeInvestigation(),
      state: {
        ...makeInvestigation().state,
        pending_action: {
          action_id: "action-1",
          tool_name: "request_measurement" as const,
          arguments: {
            measurement_type: "ac_power",
            location: "sortie onduleur",
            unit: "W",
            distinguishes: ["H1", "H2"],
          },
          reason: "Obtenir une mesure électrique réelle.",
        },
      },
    };
    const afterMeasurement: InvestigationData = {
      ...requested,
      state: {
        ...requested.state,
        observations: [
          {
            id: "observation:measurement-1",
            source_type: "measurement",
            source_id: "measurement-1",
            statement: "ac_power mesurée à sortie onduleur",
            value: 842.5,
            unit: "W",
            certainty: null,
          },
        ],
        measurements: [
          {
            id: "measurement-1",
            measurement_type: "ac_power",
            value: 842.5,
            unit: "W",
            location: "sortie onduleur",
            source_id: "action-1",
            source_type: "measurement",
          },
        ],
        pending_action: {
          action_id: "action-2",
          tool_name: "ask_technician",
          arguments: {
            question: "La valeur est-elle stable ?",
            distinguishes: ["H1", "H2"],
          },
          reason: "Qualifier la mesure.",
        },
      },
    };
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn(
      (_url: string, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Investigation
        id={requested.investigation_id}
        initial={requested}
        onHome={() => undefined}
      />,
    );

    const type = screen.getByLabelText("Type de mesure");
    expect(type).toHaveValue("ac_power");
    expect(screen.getByLabelText("Unité")).toHaveTextContent("W");
    await user.selectOptions(type, "dc_current");
    expect(screen.getByLabelText("Unité")).toHaveTextContent("A");
    await user.selectOptions(type, "ac_power");

    await user.type(screen.getByLabelText("Valeur"), "842,5");
    const location = screen.getByLabelText("Emplacement");
    await user.clear(location);
    await user.type(location, "sortie onduleur");
    await user.click(
      screen.getByRole("button", { name: "Ajouter la mesure" }),
    );

    expect(screen.getByText("Ajout de la mesure…")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/measurement");
    expect(fetchMock.mock.calls[0][1]?.body).toBe(
      JSON.stringify({
        measurement_type: "ac_power",
        value: 842.5,
        unit: "W",
        location: "sortie onduleur",
      }),
    );

    resolveRequest(jsonResponse(afterMeasurement));
    expect(
      await screen.findByText("La valeur est-elle stable ?"),
    ).toBeInTheDocument();
    expect(screen.getByText("842.5 W")).toBeInTheDocument();
    expect(screen.getAllByText("Puissance AC").length).toBeGreaterThan(0);
  });

  test("affiche une erreur si l'API refuse la mesure", async () => {
    const user = userEvent.setup();
    const requested = {
      ...makeInvestigation(),
      state: {
        ...makeInvestigation().state,
        pending_action: {
          action_id: "action-1",
          tool_name: "request_measurement" as const,
          arguments: {
            measurement_type: "dc_voltage",
            location: "sortie panneaux",
            unit: "V",
            distinguishes: ["H1"],
          },
          reason: "Mesurer la tension.",
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ detail: "Invalid measurement" }, 422)),
    );

    render(
      <Investigation
        id={requested.investigation_id}
        initial={requested}
        onHome={() => undefined}
      />,
    );
    await user.type(screen.getByLabelText("Valeur"), "38.4");
    await user.click(
      screen.getByRole("button", { name: "Ajouter la mesure" }),
    );

    expect(
      await screen.findByText(/la mesure n'a pas été enregistrée/i),
    ).toBeInTheDocument();
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
      investigating: "Diagnostic en cours",
      waiting_for_technician: "En attente de votre intervention",
      completed: "Diagnostic terminé",
      insufficient_information: "Informations insuffisantes",
    }[status];
    await waitFor(() =>
      expect(screen.getAllByText(expected).length).toBeGreaterThan(0),
    );
    expect(
      screen.queryByRole("button", { name: /terminer|conclure/i }),
    ).not.toBeInTheDocument();
    if (status === "insufficient_information") {
      expect(
        screen.getByText(
          "Informations insuffisantes pour établir un diagnostic fiable.",
        ),
      ).toBeInTheDocument();
    }
  });

  test("signale une enquête sans prochaine action au lieu de rester silencieuse", () => {
    const investigation = makeInvestigation("investigating", null);

    render(
      <Investigation
        id={investigation.investigation_id}
        initial={investigation}
        onHome={() => undefined}
      />,
    );

    expect(screen.queryByText(/poursuit son enquête/i)).not.toBeInTheDocument();
    expect(
      screen.getByText("La décision n'a pas permis de poursuivre le diagnostic."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /réessayer/i }),
    ).not.toBeInTheDocument();
  });

  test("affiche le rapport terminal à partir des données reçues", () => {
    const investigation = makeInvestigation("completed");
    investigation.state.observations = [
      {
        id: "observation:image-dust",
        source_type: "image_analysis",
        source_id: "image-panels",
        statement:
          "Une couche de poussière couvre une grande partie de plusieurs panneaux.",
        value: null,
        unit: null,
        certainty: 0.62,
      },
    ];
    investigation.state.measurements = [
      {
        id: "m-panels",
        measurement_type: "dc_voltage",
        location: "sortie panneaux",
        value: 31.5,
        unit: "V",
        source_id: "action-3",
        source_type: "measurement",
      },
    ];
    investigation.state.evidence = [
      {
        id: "image-dust",
        observation_id: "observation:image-dust",
        source_type: "image_analysis",
        source_id: "image-panels",
        certainty: 0.62,
      },
    ];
    investigation.state.hypotheses[1].status = "plausible";
    investigation.state.conclusion = {
      diagnosis:
        "Une obstruction visible des panneaux est plausible, sans élément suffisant pour exclure la chaîne électrique.",
      confidence: 0.62,
      evidence_ids: ["image-dust"],
      remaining_uncertainties: [
        "La valeur mesurée ne permet pas, à elle seule, de localiser un défaut.",
      ],
    };

    render(
      <Investigation
        id={investigation.investigation_id}
        initial={investigation}
        onHome={() => undefined}
      />,
    );

    expect(screen.getByText("Rapport")).toBeInTheDocument();
    expect(
      screen.getByText(/obstruction visible des panneaux/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Confiance fournie : 62 %")).toBeInTheDocument();
    expect(screen.getAllByText("Image").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tension DC : 31\.5 V/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/dc_voltage/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Panneaux / environnement : Plausible"),
    ).toBeInTheDocument();
    expect(screen.getByText(/localiser un défaut/i)).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { current: "step" }),
    ).toHaveTextContent("Diagnostic");
    expect(screen.queryByText(/MVP/)).not.toBeInTheDocument();
  });

  test("n'affiche pas de distinction absente de la décision", () => {
    const investigation = makeInvestigation();
    investigation.state.pending_action = {
      action_id: "action-1",
      tool_name: "ask_technician",
      arguments: { question: "Question seule ?" },
      reason: "Une raison fournie.",
    };

    render(
      <Investigation
        id={investigation.investigation_id}
        initial={investigation}
        onHome={() => undefined}
      />,
    );

    expect(screen.getByText("Question seule ?")).toBeInTheDocument();
    expect(
      screen.queryByText(/Cette vérification permet de distinguer/i),
    ).not.toBeInTheDocument();
  });

  test("signale une action non fournissable sans mentionner le MVP", () => {
    const investigation = makeInvestigation();
    investigation.state.pending_action = {
      action_id: "action-1",
      tool_name: "compare_measurements",
      arguments: {
        measurement_ids: ["m-1", "m-2"],
        comparison_reason: "Comparer deux tensions déjà reçues.",
        distinguishes: ["H2"],
      },
      reason: "Les deux mesures existent déjà.",
    };

    render(
      <Investigation
        id={investigation.investigation_id}
        initial={investigation}
        onHome={() => undefined}
      />,
    );

    expect(screen.getByText("Comparer deux tensions déjà reçues.")).toBeInTheDocument();
    expect(
      screen.getByText(/ne peut pas encore être fournie depuis l'interface/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/MVP/)).not.toBeInTheDocument();
  });
});

describe("accueil et erreurs de décision", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  test("rouvre une investigation terminée sans relancer l'enquête", async () => {
    const user = userEvent.setup();
    const saved = makeInvestigation("completed");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          {
            investigation_id: saved.investigation_id,
            status: "completed",
            updated_at: "2026-10-29T00:00:00+00:00",
            problem: saved.state.problem?.description,
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse(saved));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Diagnostics" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Voix" })).not.toBeInTheDocument();
    expect(screen.queryByText("Timeline")).not.toBeInTheDocument();
    expect(screen.queryByText(/MVP/)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /production solaire/i }),
    );

    expect(
      await screen.findByText("Conditions normales confirmées."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.method ?? "GET").not.toBe("POST");
  });

  test.each([
    [502, "Le service IA n'est pas disponible. Réessayez."],
    [504, "La décision IA a pris trop de temps. Réessayez."],
    [422, "La décision proposée n'est pas valide. Le diagnostic reste inchangé."],
    [500, "Une erreur interne est survenue."],
  ])("affiche l'erreur de création %s", async (status, message) => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/new");
    const detail =
      status === 422
        ? "Provider decision rejected by Agent Core"
        : "private secret that must stay hidden";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ detail }, status)),
    );

    render(<App />);
    await launchInvestigation(user, "Production faible.");

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/private secret/i)).not.toBeInTheDocument();
  });

  test("une session locale ne suffit pas à ouvrir l'application", async () => {
    sessionStorage.setItem(
      "bintu-session",
      JSON.stringify({
        email: "marc.laurent@bintu.demo",
        name: "Marc Laurent",
        initials: "ML",
      }),
    );
    const { clerkState } = await import("./test/setup");
    clerkState.isSignedIn = false;
    clerkState.orgId = null;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Connexion" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Diagnostic technique intelligent/)).not.toBeInTheDocument();
  });
});
