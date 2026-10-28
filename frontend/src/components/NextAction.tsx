import type {
  MeasurementCatalogItem,
  PendingAction,
} from "../types/investigation";

function textArgument(
  arguments_: Record<string, unknown>,
  key: string,
): string | null {
  const value = arguments_[key];
  return typeof value === "string" ? value : null;
}

export function actionPresentation(
  action: PendingAction,
  measurementCatalog: MeasurementCatalogItem[] = [],
) {
  const args = action.arguments;
  switch (action.tool_name) {
    case "ask_technician":
      return {
        label: "Répondez à la question",
        instruction: textArgument(args, "question"),
      };
    case "request_measurement": {
      const type = textArgument(args, "measurement_type");
      const location = textArgument(args, "location");
      const label =
        measurementCatalog.find(
          (item) => item.measurement_type === type,
        )?.label ?? type;
      return {
        label: "BINTU a besoin d'une mesure pour poursuivre l'enquête",
        instruction: [label, location]
          .filter(Boolean)
          .join(" — "),
      };
    }
    case "analyze_image":
      return {
        label: "Photo demandée",
        instruction: textArgument(args, "focus"),
      };
    case "compare_measurements":
      return {
        label: "Comparaison en cours",
        instruction: textArgument(args, "comparison_reason"),
      };
    default:
      return {
        label: "Prochaine étape de l'enquête",
        instruction: null,
      };
  }
}

export function NextAction({
  action,
  measurementCatalog = [],
}: {
  action: PendingAction;
  measurementCatalog?: MeasurementCatalogItem[];
}) {
  const presentation = actionPresentation(action, measurementCatalog);
  return (
    <section className="next-action" aria-labelledby="next-action-title">
      <div className="next-action-heading">
        <span className="action-index" aria-hidden="true">
          →
        </span>
        <div>
          <p className="eyebrow">Prochaine action</p>
          <h2 id="next-action-title">{presentation.label}</h2>
        </div>
      </div>
      {presentation.instruction && (
        <p className="action-instruction">{presentation.instruction}</p>
      )}
      {action.reason && (
        <div className="action-reason">
          <strong>Pourquoi BINTU le demande</strong>
          <span>{action.reason}</span>
        </div>
      )}
    </section>
  );
}
