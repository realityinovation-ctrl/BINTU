import { useEffect, useRef, useState } from "react";
import { transcribeAudio } from "../api/client";
import {
  startWavRecording,
  type WavRecording,
} from "../audio/recorder";
import { MicIcon } from "./Icons";

type VoiceState = "ready" | "recording" | "transcribing" | "review";

interface VoiceInputProps {
  investigationId: string;
  disabled?: boolean;
  onUse: (text: string) => void;
}

export function VoiceInput({
  investigationId,
  disabled = false,
  onUse,
}: VoiceInputProps) {
  const [state, setState] = useState<VoiceState>("ready");
  const [transcription, setTranscription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recording = useRef<WavRecording | null>(null);
  const transcriptionField = useRef<HTMLTextAreaElement | null>(null);

  useEffect(
    () => () => {
      if (recording.current) void recording.current.cancel();
    },
    [],
  );

  async function start() {
    setError(null);
    try {
      recording.current = await startWavRecording();
      setState("recording");
    } catch {
      setError(
        "Le microphone n'est pas accessible. Vous pouvez continuer par texte.",
      );
    }
  }

  async function stop() {
    const activeRecording = recording.current;
    if (!activeRecording) return;
    recording.current = null;
    setState("transcribing");
    setError(null);
    try {
      const audio = await activeRecording.stop();
      const text = await transcribeAudio(investigationId, audio);
      setTranscription(text);
      setState("review");
    } catch {
      setState("ready");
      setError(
        "La transcription a échoué. Vous pouvez réessayer ou répondre par texte.",
      );
    }
  }

  function useTranscription() {
    const confirmed = transcription.trim();
    if (!confirmed) return;
    setState("ready");
    setTranscription("");
    onUse(confirmed);
  }

  return (
    <div className="voice-input">
      {state === "ready" && (
        <button
          className="voice-button"
          type="button"
          onClick={() => void start()}
          disabled={disabled}
        >
          <MicIcon /> Parler
        </button>
      )}
      {state === "recording" && (
        <button
          className="voice-button recording-button"
          type="button"
          onClick={() => void stop()}
        >
          <span className="recording-dot" aria-hidden="true" />
          Enregistrement… Arrêter
        </button>
      )}
      {state === "transcribing" && (
        <div className="voice-progress" role="status" aria-live="polite">
          <span className="spinner small-spinner" aria-hidden="true" />
          BINTU transcrit votre réponse…
        </div>
      )}
      {state === "review" && (
        <section className="transcription-review" aria-labelledby="transcription-title">
          <p className="eyebrow" id="transcription-title">
            Transcription
          </p>
          <textarea
            ref={transcriptionField}
            value={transcription}
            onChange={(event) => setTranscription(event.target.value)}
            rows={4}
            aria-label="Transcription à vérifier"
          />
          <div className="transcription-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => transcriptionField.current?.focus()}
            >
              Modifier
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={useTranscription}
              disabled={!transcription.trim()}
            >
              Utiliser cette réponse
            </button>
          </div>
        </section>
      )}
      {error && (
        <p className="voice-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
