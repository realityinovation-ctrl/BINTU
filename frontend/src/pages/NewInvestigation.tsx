import { useRef, useState } from "react";
import { createInvestigation, decisionFailureMessage } from "../api/client";
import { Icon, type IconName } from "../components/Icons";
import { LoadingState } from "../components/LoadingState";
import { Shell } from "../components/Shell";
import type { Investigation } from "../types/investigation";

interface NewInvestigationProps {
  onHome: () => void;
  onDiagnostics: () => void;
  onNew: () => void;
  onCreated: (investigation: Investigation) => void;
}

const SYMPTOMS: { id: string; icon: IconName; label: string; detail: string }[] = [
  {
    id: "production",
    icon: "activity",
    label: "Production faible",
    detail: "Rendement inférieur à l’attendu",
  },
  {
    id: "intermittent",
    icon: "bolt",
    label: "Fonctionnement instable",
    detail: "Baisses ou arrêts intermittents",
  },
  {
    id: "alert",
    icon: "warning",
    label: "Alerte équipement",
    detail: "Voyant ou message d’erreur",
  },
  {
    id: "other",
    icon: "help",
    label: "Autre observation",
    detail: "Situation à décrire librement",
  },
];

interface SpeechEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognizer {
  lang: string;
  start: () => void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: (() => void) | null;
}

function createRecognizer(): SpeechRecognizer | null {
  const host = window as Window & {
    SpeechRecognition?: new () => SpeechRecognizer;
    webkitSpeechRecognition?: new () => SpeechRecognizer;
  };
  const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function NewInvestigation({
  onHome,
  onDiagnostics,
  onNew,
  onCreated,
}: NewInvestigationProps) {
  const [step, setStep] = useState(1);
  const [symptom, setSymptom] = useState("production");
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [observation, setObservation] = useState("");
  const [observationMissing, setObservationMissing] = useState(false);
  const [observedAt, setObservedAt] = useState("");
  const [equipment, setEquipment] = useState("");
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const [documentNames, setDocumentNames] = useState<string[]>([]);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);
  const selected = SYMPTOMS.find((item) => item.id === symptom) ?? SYMPTOMS[0];

  function problemText() {
    const parts = [`${selected.label} — ${observation.trim()}`];
    if (observedAt.trim()) parts.push(`Première observation : ${observedAt.trim()}`);
    if (equipment.trim()) parts.push(`Équipement concerné : ${equipment.trim()}`);
    return parts.join(". ");
  }

  async function launch() {
    const description = problemText();
    if (!observation.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      onCreated(await createInvestigation(description));
    } catch (caught) {
      setError(
        decisionFailureMessage(caught) ??
          "Impossible de créer le diagnostic. Vérifiez que le backend est disponible.",
      );
      setSubmitting(false);
    }
  }

  function dictate() {
    const recognition = createRecognizer();
    if (!recognition) {
      setVoiceHint("La dictée n’est pas disponible dans ce navigateur. Écrivez l’observation.");
      return;
    }
    setVoiceHint(null);
    recognition.lang = "fr-FR";
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (!transcript) return;
      setObservation((current) => (current ? `${current} ${transcript}` : transcript));
      setInputMode("text");
    };
    recognition.onerror = () => {
      setVoiceHint("La dictée n’a pas abouti. Vous pouvez écrire l’observation.");
    };
    recognition.start();
  }

  const attachments = photoNames.length + documentNames.length;

  return (
    <Shell
      active="new"
      title="Nouveau diagnostic"
      onNew={onNew}
      onHome={onHome}
      onDiagnostics={onDiagnostics}
    >
      <div className="page new-page">
        <div className="new-layout">
          <section className="card form-card">
            {submitting ? (
              <LoadingState message="Démarrage du diagnostic…" />
            ) : (
              <>
                {step === 1 && (
                  <>
                    <div className="section-heading">
                      <span>OBSERVATION INITIALE</span>
                      <span className="required">Étape 1 sur 3</span>
                    </div>
                    <div className="field">
                      <label>Quel type de symptôme observez-vous ?</label>
                      <div className="symptom-grid">
                        {SYMPTOMS.map((item) => (
                          <button
                            key={item.id}
                            className={`button symptom-option ${symptom === item.id ? "selected" : ""}`}
                            type="button"
                            onClick={() => setSymptom(item.id)}
                          >
                            <Icon name={item.icon} />
                            <span>
                              <strong>{item.label}</strong>
                              <small>{item.detail}</small>
                            </span>
                            {symptom === item.id && <Icon name="check" size={15} />}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="field">
                      <div className="input-mode-heading">
                        <label htmlFor="observation">
                          Décrivez précisément ce que vous constatez
                        </label>
                        <div className="mode-switch">
                          <button
                            className={`button ${inputMode === "text" ? "active" : ""}`}
                            type="button"
                            onClick={() => setInputMode("text")}
                          >
                            <Icon name="document" />
                            Écrire
                          </button>
                          <button
                            className={`button ${inputMode === "voice" ? "active" : ""}`}
                            type="button"
                            onClick={() => setInputMode("voice")}
                          >
                            <Icon name="microphone" />
                            Dicter
                          </button>
                        </div>
                      </div>
                      {inputMode === "text" ? (
                        <div className={`observation-input ${observationMissing ? "invalid" : ""}`}>
                          <textarea
                            id="observation"
                            className="text-input textarea"
                            value={observation}
                            aria-invalid={observationMissing}
                            onChange={(event) => {
                              setObservation(event.target.value);
                              if (event.target.value.trim()) setObservationMissing(false);
                            }}
                            placeholder="Ex. Depuis ce matin, l’onduleur 2 produit par intermittence. Aucun code d’erreur n’est visible…"
                            required
                          />
                          <span className="input-guidance">
                            Décrivez les faits observés, leur fréquence et depuis quand ils se
                            produisent.
                          </span>
                        </div>
                      ) : (
                        <div className="voice-recorder">
                          <div className="voice-icon">
                            <Icon name="microphone" size={24} />
                          </div>
                          <div>
                            <strong>Prêt à enregistrer votre observation</strong>
                            <span>
                              Parlez naturellement. Vous pourrez relire la transcription avant
                              de continuer.
                            </span>
                            {voiceHint && <span>{voiceHint}</span>}
                          </div>
                          <button className="button primary-button" type="button" onClick={dictate}>
                            Démarrer
                          </button>
                        </div>
                      )}
                      {observationMissing && (
                        <p className="field-hint alert" role="alert">
                          Décrivez le fait observé pour continuer.
                        </p>
                      )}
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor="observed-at">Première observation</label>
                        <input
                          id="observed-at"
                          className="text-input"
                          value={observedAt}
                          onChange={(event) => setObservedAt(event.target.value)}
                          placeholder="Aujourd’hui, vers 08:30"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="equipment">Équipement concerné</label>
                        <input
                          id="equipment"
                          className="text-input"
                          value={equipment}
                          onChange={(event) => setEquipment(event.target.value)}
                          placeholder="Ex. Onduleur 2"
                        />
                      </div>
                    </div>
                    <div className="initial-evidence">
                      <div>
                        <span>PREUVES INITIALES</span>
                        <small>Facultatif · aucun fichier ne sera analysé sans validation</small>
                      </div>
                      <div className="evidence-actions">
                        <button
                          className="button secondary-button"
                          type="button"
                          onClick={() => photoRef.current?.click()}
                        >
                          <Icon name="camera" />
                          Ajouter des photos
                        </button>
                        <button
                          className="button secondary-button"
                          type="button"
                          onClick={() => documentRef.current?.click()}
                        >
                          <Icon name="document" />
                          Joindre un relevé
                        </button>
                        <input
                          ref={photoRef}
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          aria-label="Ajouter des photos"
                          onChange={(event) =>
                            setPhotoNames(
                              Array.from(event.target.files ?? []).map((file) => file.name),
                            )
                          }
                        />
                        <input
                          ref={documentRef}
                          type="file"
                          accept=".pdf,.csv,.txt,image/*"
                          hidden
                          aria-label="Joindre un relevé"
                          onChange={(event) =>
                            setDocumentNames(
                              Array.from(event.target.files ?? []).map((file) => file.name),
                            )
                          }
                        />
                      </div>
                    </div>
                    {attachments > 0 && (
                      <p className="field-hint">
                        {[...photoNames, ...documentNames].join(", ")}. Ces fichiers restent sur
                        cet écran. Ils ne sont pas envoyés avec le diagnostic.
                      </p>
                    )}
                    <div className="notice compact">
                      <Icon name="info" />
                      <span>
                        À la création, BINTU enregistre uniquement la description du problème :
                        le symptôme, l’observation, et l’horaire ou l’équipement s’ils sont précisés.
                      </span>
                    </div>
                  </>
                )}
                {step === 2 && (
                  <>
                    <div className="section-heading">
                      <span>CONTEXTE SAISI</span>
                      <span className="required">Étape 2 sur 3</span>
                    </div>
                    <div className={`selection-card ${equipment.trim() ? "selected" : "empty"}`}>
                      <div className="site-selection-icon">
                        <Icon name="bolt" />
                      </div>
                      <div>
                        <strong>{equipment.trim() || "Aucun équipement indiqué"}</strong>
                        <span>{selected.label}</span>
                      </div>
                    </div>
                    <div className="info-grid">
                      <div>
                        <span>Première observation</span>
                        <strong>{observedAt.trim() || "Non précisée"}</strong>
                      </div>
                      <div>
                        <span>Photos</span>
                        <strong>{photoNames.length === 0 ? "Aucune, non envoyée" : "Non envoyées"}</strong>
                      </div>
                      <div>
                        <span>Relevé</span>
                        <strong>{documentNames.length === 0 ? "Aucun, non envoyé" : "Non envoyé"}</strong>
                      </div>
                      <div>
                        <span>Symptôme</span>
                        <strong>{selected.label}</strong>
                      </div>
                    </div>
                    <div className="notice compact">
                      <Icon name="info" />
                      <span>
                        L’horaire et l’équipement, s’ils sont remplis, sont ajoutés à la description
                        du problème. Aucune caractéristique du système n’est inventée. Les fichiers choisis
                        ne sont pas envoyés.
                      </span>
                    </div>
                  </>
                )}
                {step === 3 && (
                  <>
                    <div className="section-heading">
                      <span>CONFIRMATION</span>
                      <span className="required">Étape 3 sur 3</span>
                    </div>
                    <div className="review-hero">
                      <div className="review-icon">
                        <Icon name="activity" />
                      </div>
                      <div>
                        <span>Ce qui sera transmis au diagnostic</span>
                        <strong>Description du problème</strong>
                        <p className="transmitted-copy">{problemText()}</p>
                      </div>
                    </div>
                    <p className="field-hint">
                      Seule cette description est enregistrée à la création du diagnostic.
                    </p>
                    {attachments > 0 && (
                      <div className="notice compact">
                        <Icon name="info" />
                        <span>
                          Contexte saisi, non envoyé : {[...photoNames, ...documentNames].join(", ")}.
                          Ces fichiers restent sur cet écran.
                        </span>
                      </div>
                    )}
                    <div className="notice launch-notice">
                      <Icon name="spark" />
                      <div>
                        <strong>
                          BINTU va ouvrir un diagnostic, pas produire une réponse immédiate
                        </strong>
                        <span>
                          Il formulera les hypothèses, identifiera l’information manquante
                          puis proposera une première vérification justifiée.
                        </span>
                      </div>
                    </div>
                    {error && (
                      <p className="field-hint" role="alert">
                        {error}
                      </p>
                    )}
                  </>
                )}
                <div className="form-footer">
                  <button
                    className="button secondary-button"
                    type="button"
                    disabled={step === 1}
                    onClick={() => setStep((current) => Math.max(1, current - 1))}
                  >
                    Retour
                  </button>
                  {step < 3 ? (
                    <button
                      className="button primary-button"
                      type="button"
                      onClick={() => {
                        if (step === 1 && !observation.trim()) {
                          setObservationMissing(true);
                          setInputMode("text");
                          return;
                        }
                        setObservationMissing(false);
                        setStep((current) => current + 1);
                      }}
                    >
                      <Icon name="arrow" />
                      Continuer
                    </button>
                  ) : (
                    <button
                      className="button primary-button launch-button"
                      type="button"
                      onClick={() => void launch()}
                    >
                      <Icon name="spark" />
                      Démarrer le diagnostic
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
          <aside className="new-assistant card">
            <div className="assistant-mark">
              <Icon name="spark" />
            </div>
            <span className="assistant-kicker">COMMENT BIEN DÉMARRER</span>
            <h2 className="assistant-title">
              {step === 1
                ? "Décrivez des faits, pas une conclusion."
                : step === 2
                  ? "Confirmez ce que vous avez observé."
                  : "Vous gardez le contrôle."}
            </h2>
            <p>
              {step === 1
                ? "Une bonne observation indique ce qui se passe, depuis quand, à quelle fréquence et sur quel équipement."
                : step === 2
                  ? "Le symptôme, l’observation et, s’ils sont précisés, l’horaire et l’équipement entrent dans la description. Les fichiers ne sont pas envoyés."
                  : "BINTU ne retiendra aucune cause sans preuve et signalera clairement ce qui reste incertain."}
            </p>
            <div className="assistant-examples">
              <span>
                {step === 1 ? "EXEMPLE UTILE" : step === 2 ? "CE QUI EST TRANSMIS" : "GARDE-FOUS"}
              </span>
              {step === 1 ? (
                <blockquote>
                  « L’onduleur 2 alterne entre production normale et chute brutale depuis
                  08:30. »
                </blockquote>
              ) : step === 2 ? (
                <ul>
                  <li>Le symptôme choisi</li>
                  <li>L’observation rédigée</li>
                  <li>L’équipement, s’il est précisé</li>
                </ul>
              ) : (
                <ul>
                  <li>Aucune mesure inventée</li>
                  <li>Une élimination exige une preuve contradictoire forte</li>
                  <li>Un conducteur sous tension est refusé</li>
                </ul>
              )}
            </div>
            <div className="assistant-footer">
              <Icon name="shield" size={16} />
              BINTU est une aide au diagnostic pour techniciens qualifiés.
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}
