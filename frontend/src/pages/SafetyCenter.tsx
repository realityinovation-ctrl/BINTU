import { Icon } from "../components/Icons";
import { Shell } from "../components/Shell";

const CHECKS: [string, string][] = [
  [
    "Validation des décisions",
    "Une décision proposée doit contenir une raison et des références cohérentes avant d’être appliquée à l’état du diagnostic.",
  ],
  [
    "Gestion des preuves",
    "Une hypothèse ne peut être éliminée que si une preuve contradictoire forte est enregistrée.",
  ],
  [
    "Mesures contrôlées",
    "Une mesure demandée doit appartenir au catalogue autorisé, avec l’unité prévue pour ce type.",
  ],
  [
    "Niveau de confiance",
    "Une conclusion proposée avec une confiance élevée doit s’appuyer sur une mesure réelle, et pas seulement sur une image.",
  ],
  [
    "Actions à risque",
    "Une décision qui demande d’ouvrir ou de déconnecter un conducteur sous tension est rejetée.",
  ],
];

const EXAMPLES = [
  "Ouvrir ou déconnecter un conducteur sous tension",
  "Éliminer une hypothèse sans preuve contradictoire forte",
  "Demander une mesure absente du catalogue",
  "Conclure avec une confiance élevée sans mesure",
];

export function SafetyCenter({
  onNew,
  onHome,
  onDiagnostics,
}: {
  onNew: () => void;
  onHome: () => void;
  onDiagnostics: () => void;
}) {
  return (
    <Shell
      active="safety"
      title="Centre de sécurité"
      onNew={onNew}
      onHome={onHome}
      onDiagnostics={onDiagnostics}
    >
      <div className="page safety-page">
        <div className="page-heading">
          <div>
            <div className="breadcrumb">Gouvernance BINTU</div>
            <h1 className="page-title">Centre de sécurité</h1>
            <div className="page-meta">
              Garde-fous appliqués lors des décisions de BINTU.
            </div>
          </div>
        </div>
        <div className="safety-hero">
          <div className="safety-hero-icon">
            <Icon name="shield" size={30} />
          </div>
          <div>
            <span>VALIDATION</span>
            <h2>Le cœur BINTU valide les décisions proposées</h2>
            <p>
              Le modèle propose une action. Le cœur vérifie qu’elle respecte les preuves
              disponibles et les garde-fous, puis l’applique à l’état du diagnostic.
            </p>
          </div>
        </div>
        <div className="safety-grid">
          <section className="card rules-card">
            <div className="section-heading">
              <span>CE QUE LE CŒUR VÉRIFIE</span>
            </div>
            {CHECKS.map(([title, detail], index) => (
              <div className="rule-row" key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
                <Icon name="check" size={16} />
              </div>
            ))}
          </section>
          <aside className="safety-side">
            <section className="card blocked-actions">
              <div className="section-heading">
                <span>Exemples de décisions rejetées</span>
              </div>
              {EXAMPLES.map((item) => (
                <div key={item}>
                  <Icon name="warning" size={15} />
                  {item}
                </div>
              ))}
            </section>
            <section className="card meta-stack">
              <div className="section-heading">
                <span>RESPONSABILITÉS</span>
              </div>
              <div>
                <span className="meta-badge">IA</span>
                <strong>Proposition</strong>
                <p>Propose la prochaine action à partir des informations déjà reçues.</p>
              </div>
              <div className="bintu-core">
                <span className="meta-badge">BINTU</span>
                <strong>Cœur du diagnostic</strong>
                <p>
                  Valide la proposition, conserve l’état et applique uniquement une décision acceptée.
                </p>
              </div>
            </section>
            <div className="safety-permanent">
              <Icon name="info" />
              BINTU ne remplace jamais le jugement d’un technicien qualifié.
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}
