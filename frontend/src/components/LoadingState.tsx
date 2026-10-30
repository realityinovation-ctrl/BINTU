export function LoadingState({
  message = "Chargement du diagnostic…",
}: {
  message?: string;
}) {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <h2>{message}</h2>
    </div>
  );
}
