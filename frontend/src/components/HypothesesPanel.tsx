import type { Hypothesis } from "../types/investigation";
import {
  HYPOTHESIS_LABELS,
  HYPOTHESIS_STATUS_LABELS,
} from "../presentation/labels";
import { StatusPill } from "./Shell";

const KIND: Record<
  Hypothesis["status"],
  "blue" | "amber" | "green" | "gray"
> = {
  unexplored: "gray",
  plausible: "blue",
  supported: "green",
  weakened: "amber",
  eliminated: "gray",
};

export function HypothesesPanel({
  hypotheses,
}: {
  hypotheses: Hypothesis[];
}) {
  return (
    <div>
      {hypotheses.map((hypothesis) => {
        const { status } = hypothesis;
        const supporting = hypothesis.supporting_evidence_ids.length;
        const contradictory = hypothesis.contradictory_evidence_ids.length;
        const eliminated = status === "eliminated";
        return (
          <div
            className={`hypothesis ${eliminated ? "crossed" : ""}`}
            key={hypothesis.hypothesis_id}
          >
            <div className="hypothesis-top">
              <h3 className="hypothesis-title">
                {HYPOTHESIS_LABELS[hypothesis.hypothesis_id]}
              </h3>
              <StatusPill kind={KIND[status]}>
                {HYPOTHESIS_STATUS_LABELS[status]}
              </StatusPill>
            </div>
            {supporting + contradictory > 0 && (
              <div className="hypothesis-detail">
                Pour {supporting} · Contre {contradictory}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
