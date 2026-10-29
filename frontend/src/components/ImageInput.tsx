import { ChangeEvent, useEffect, useRef, useState } from "react";
import { analyzeImage, decisionFailureMessage } from "../api/client";
import type { Investigation } from "../types/investigation";

interface ImageInputProps {
  investigationId: string;
  onAnalyzed: (investigation: Investigation) => void;
}

export function ImageInput({
  investigationId,
  onAnalyzed,
}: ImageInputProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setFile(event.target.files?.[0] ?? null);
  }

  function removeImage() {
    setFile(null);
    setError(null);
    if (input.current) input.current.value = "";
  }

  async function submitImage() {
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    try {
      const updated = await analyzeImage(investigationId, file);
      setAnalyzing(false);
      setFile(null);
      onAnalyzed(updated);
    } catch (caught) {
      setError(
        decisionFailureMessage(caught) ??
          "L'analyse de l'image a échoué. Vous pouvez remplacer la photo et réessayer.",
      );
      setAnalyzing(false);
    }
  }

  return (
    <section className="image-input" aria-labelledby="image-input-title">
      <div>
        <p className="eyebrow">Photo demandée</p>
        <h2 id="image-input-title">Ajouter une observation visuelle</h2>
        <p className="image-help">
          La photo sera analysée comme une observation, jamais comme une
          mesure électrique.
        </p>
      </div>

      {!file && (
        <label className="photo-button">
          <span aria-hidden="true">📷</span> Ajouter une photo
          <input
            ref={input}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={selectImage}
          />
        </label>
      )}

      {file && preview && (
        <div className="image-preview">
          <img src={preview} alt="Aperçu de la photo sélectionnée" />
          <div className="image-actions">
            <label className="secondary-button">
              Remplacer
              <input
                ref={input}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={selectImage}
              />
            </label>
            <button
              className="secondary-button"
              type="button"
              onClick={removeImage}
              disabled={analyzing}
            >
              Supprimer
            </button>
          </div>
          <button
            className="primary-button full-width"
            type="button"
            onClick={() => void submitImage()}
            disabled={analyzing}
          >
            {analyzing ? (
              <>
                <span className="spinner small-spinner" aria-hidden="true" />
                Analyse de l&apos;image…
              </>
            ) : (
              "Analyser avec BINTU"
            )}
          </button>
        </div>
      )}

      {error && (
        <p className="voice-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
