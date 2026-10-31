import { describe, expect, test } from "vitest";
import {
  distinguishesLabels,
  humanizeTimelineSummary,
  measurementLine,
  observationIsCited,
  spineStates,
} from "./labels";
import type { Measurement } from "../types/investigation";

describe("présentation des données reçues", () => {
  test("traduit uniquement les hypothèses réellement distinguées", () => {
    expect(distinguishesLabels(["H2", "H3", "H9"])).toEqual([
      "Chaîne électrique",
      "Stockage / conversion",
    ]);
    expect(distinguishesLabels(["H1"], "electrical")).toEqual(["H1"]);
    expect(distinguishesLabels(undefined)).toEqual([]);
    expect(distinguishesLabels("H2")).toEqual([]);
  });

  test("nomme une mesure par le catalogue, jamais par sa clé", () => {
    const measurement: Measurement = {
      id: "m-1",
      measurement_type: "dc_voltage",
      location: "sortie panneaux",
      value: 31.5,
      unit: "V",
      source_id: "action-1",
      source_type: "measurement",
    };
    expect(
      measurementLine(measurement, [
        { measurement_type: "dc_voltage", label: "Tension DC", unit: "V" },
      ]),
    ).toBe("Tension DC : 31.5 V — sortie panneaux");
    expect(measurementLine(measurement, [])).toBe(
      "Mesure : 31.5 V — sortie panneaux",
    );
  });

  test("ne marque citée qu'une preuve présente dans la conclusion", () => {
    const evidence = [
      { id: "image-dust", observation_id: "observation:image-dust" },
      { id: "other", observation_id: "observation:answer" },
    ];
    const cited = new Set(["image-dust"]);
    expect(observationIsCited("observation:image-dust", evidence, cited)).toBe(true);
    expect(observationIsCited("observation:answer", evidence, cited)).toBe(false);
    expect(observationIsCited("missing", evidence, cited)).toBe(false);
  });

  test("place le diagnostic comme étape courante seulement en fin d'enquête", () => {
    expect(
      spineStates({
        hasProblem: true,
        hasCollected: false,
        hasHypothesisMovement: false,
        status: "waiting_for_technician",
      }).verification,
    ).toBe("current");
    expect(
      spineStates({
        hasProblem: true,
        hasCollected: true,
        hasHypothesisMovement: true,
        status: "completed",
      }).diagnosis,
    ).toBe("current");
    expect(
      spineStates({
        hasProblem: true,
        hasCollected: false,
        hasHypothesisMovement: false,
        status: "insufficient_information",
      }).result,
    ).toBe("complete");
  });

  test("rend la chronologie lisible sans nom technique", () => {
    expect(humanizeTimelineSummary("Action externe demandée : ask_technician.")).toBe(
      "Question posée.",
    );
    expect(humanizeTimelineSummary("Action externe demandée : request_measurement.")).toBe(
      "Mesure demandée.",
    );
    expect(humanizeTimelineSummary("Action externe demandée : analyze_image.")).toBe(
      "Image analysée.",
    );
    expect(humanizeTimelineSummary("Action externe demandée : finish_investigation.")).toBe(
      "Conclusion du diagnostic.",
    );
    expect(
      humanizeTimelineSummary("Statut : investigating -> waiting_for_technician."),
    ).toBe("Statut : Diagnostic en cours → En attente de votre intervention.");
    expect(humanizeTimelineSummary("H1: unexplored -> plausible.")).toBe(
      "Panneaux / environnement : À explorer → Plausible.",
    );
    expect(humanizeTimelineSummary("Observation ajoutée depuis technician_answer.")).toBe(
      "Information enregistrée depuis une réponse du technicien.",
    );
    expect(humanizeTimelineSummary("Obtenir une observation avant de poursuivre.")).toBe(
      "Obtenir une observation avant de poursuivre.",
    );
    expect(
      humanizeTimelineSummary("Gather initial system context before testing hypotheses"),
    ).toBe(
      "BINTU a besoin de mieux comprendre le système avant de tester ses hypothèses.",
    );
    expect(humanizeTimelineSummary("Please inspect the inverter display.")).toBe(
      "Cette information aidera BINTU à poursuivre le diagnostic.",
    );
    expect(humanizeTimelineSummary("Inspect inverter display carefully today.")).toBe(
      "Cette information aidera BINTU à poursuivre le diagnostic.",
    );
  });
});
