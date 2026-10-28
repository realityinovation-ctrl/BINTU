export function ProblemCard({ description }: { description: string }) {
  return (
    <section className="card problem-card" aria-labelledby="problem-title">
      <p className="eyebrow">Problème actuel</p>
      <h2 id="problem-title">{description}</h2>
    </section>
  );
}
