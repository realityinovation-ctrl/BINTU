import { Header } from "../components/Header";

export function Home({ onNew }: { onNew: () => void }) {
  return (
    <div className="page-shell home-page">
      <Header />
      <main className="home-main">
        <section className="hero">
          <div className="hero-mark" aria-hidden="true">
            ☀
          </div>
          <p className="eyebrow">Assistant de diagnostic solaire</p>
          <h1>BINTU</h1>
          <p className="hero-tagline">
            L&apos;IA qui enquête avec vous sur vos installations solaires
          </p>
          <p className="hero-description">
            Décrivez un problème, répondez aux questions de BINTU et
            laissez-le guider l&apos;investigation jusqu&apos;au diagnostic.
          </p>
          <button className="primary-button hero-cta" type="button" onClick={onNew}>
            Nouvelle investigation
            <span aria-hidden="true">→</span>
          </button>
        </section>
        <section className="principles" aria-label="Principes de BINTU">
          <article>
            <span className="principle-number">01</span>
            <h2>Questions ciblées</h2>
            <p>Chaque demande sert l&apos;investigation en cours.</p>
          </article>
          <article>
            <span className="principle-number">02</span>
            <h2>Hypothèses vérifiées</h2>
            <p>Les pistes restent distinctes des faits observés.</p>
          </article>
          <article>
            <span className="principle-number">03</span>
            <h2>Diagnostic fondé sur les preuves</h2>
            <p>BINTU peut aussi conclure que les informations manquent.</p>
          </article>
        </section>
        <p className="central-promise">
          « BINTU ne répond pas seulement. BINTU enquête. »
        </p>
      </main>
    </div>
  );
}
