import type { PendingAction } from "../types/investigation";

function textArgument(
  arguments_: Record<string, unknown>,
  key: string,
): string | null {
  const value = arguments_[key];
  return typeof value === "string" ? value : null;
}

export function actionPresentation(action: PendingAction) {
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
      const unit = textArgument(args, "unit");
      return {
        label: "Fournissez la mesure demandée",
        instruction: [type, location && `à ${location}`, unit && `en ${unit}`]
          .filter(Boolean)
          .join(" "),
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

export function NextAction({ action }: { action: PendingAction }) {
  const presentation = actionPresentation(action);
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
