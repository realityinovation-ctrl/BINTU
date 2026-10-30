import type { ReactNode } from "react";

export function VerificationScene({
  problem,
  gesture,
  reason,
  distinguishes,
  children,
}: {
  problem?: string;
  gesture: string | null;
  reason: string | null;
  distinguishes: string[];
  children: ReactNode;
}) {
  return (
    <section className="scene next-check" aria-labelledby="scene-title">
      {problem && (
        <p className="scene-problem">
          <span>Problème</span>
          {problem}
        </p>
      )}
      <div className="scene-lead" aria-live="polite">
        <p className="next-label">Prochaine vérification</p>
        <h2 id="scene-title">{gesture ?? "BINTU a besoin d'une vérification"}</h2>
      </div>
      {reason && (
        <div className="scene-block">
          <h3>Pourquoi BINTU la demande</h3>
          <p>{reason}</p>
        </div>
      )}
      {distinguishes.length > 0 && (
        <div className="scene-block distinguish">
          <h3>Ce que cette action permet de distinguer</h3>
          <p>Cette vérification permet de distinguer :</p>
          <ul className="distinguish-list" aria-label="Hypothèses distinguées">
            {distinguishes.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="scene-action">{children}</div>
    </section>
  );
}
