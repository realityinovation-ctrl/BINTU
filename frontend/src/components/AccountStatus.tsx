import { useEffect, useState } from "react";
import { fetchAiStatus, type AiStatus } from "../api/aiStatus";
import { formatQuotaLine, type UsageQuota } from "../auth/quota";

export function AccountStatus({ quota }: { quota: UsageQuota | null }) {
  const [ai, setAi] = useState<AiStatus | null>(null);

  useEffect(() => {
    let active = true;
    fetchAiStatus()
      .then((status) => {
        if (active) setAi(status);
      })
      .catch(() => {
        if (active) setAi(null);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="account-status" aria-label="Usage et statut">
      {quota ? (
        <ul className="account-quota">
          <li>
            Messages{" "}
            <strong>
              {formatQuotaLine(
                quota.messages_used,
                quota.messages_limit,
                "auj.",
              )}
            </strong>
          </li>
          <li>
            Diagnostics{" "}
            <strong>
              {formatQuotaLine(
                quota.investigations_used,
                quota.investigations_limit,
                "auj.",
              )}
            </strong>
          </li>
          <li>
            Live{" "}
            <strong>
              {formatQuotaLine(
                Math.round(quota.live_minutes_used * 10) / 10,
                quota.live_minutes_limit,
                "min",
              )}
            </strong>
          </li>
        </ul>
      ) : (
        <p className="account-status-muted">Quotas locaux (sans session). </p>
      )}
      {ai ? (
        <p className="account-ai">
          IA : <strong>{ai.label ?? "non configurée"}</strong>
          {ai.live?.ready ? " · Live prêt" : " · Live indisponible"}
          {ai.assistant_memory?.enabled === false
            ? " · mémoire off"
            : ai.assistant_memory?.backend
              ? ` · mémoire ${ai.assistant_memory.backend}`
              : ""}
          {ai.assistant_memory?.mem0_requested &&
          ai.assistant_memory?.backend !== "mem0"
            ? " · Mem0 demandé"
            : ""}
        </p>
      ) : (
        <p className="account-status-muted">Statut IA indisponible.</p>
      )}
    </div>
  );
}
