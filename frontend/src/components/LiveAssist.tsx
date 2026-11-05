import { useEffect, useRef, useState } from "react";
import {
  currentAccessToken,
  getInvestigationOverlay,
} from "../api/client";
import {
  base64ToBytes,
  buildLiveWebSocketUrl,
  bytesToBase64,
  type LiveServerMessage,
} from "../api/liveSession";
import type { OverlayPayload } from "../types/overlay";
import { Icon } from "./Icons";
import { drawOverlayPayload } from "./overlayDraw";

interface LiveAssistProps {
  investigationId?: string | null;
  /** Rafraîchir le calque quand l'étape change (step / pending). */
  overlayRevision?: string;
  /** Brief d'enquête poussé au Live via message WS `context`. */
  contextBrief?: string;
  onSessionEnd?: () => void;
  initiallyOpen?: boolean;
}

type LiveStatus = "idle" | "connecting" | "live" | "error";

export function LiveAssist({
  investigationId = null,
  overlayRevision = "none",
  contextBrief = "",
  onSessionEnd,
  initiallyOpen = false,
}: LiveAssistProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(initiallyOpen);
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [overlay, setOverlay] = useState<OverlayPayload | null>(null);
  const sessionRef = useRef<{
    ws: WebSocket | null;
    stream: MediaStream | null;
    audioCtx: AudioContext | null;
    processor: ScriptProcessorNode | null;
    frameTimer: number | null;
    playChain: Promise<void>;
  }>({
    ws: null,
    stream: null,
    audioCtx: null,
    processor: null,
    frameTimer: null,
    playChain: Promise.resolve(),
  });

  useEffect(() => {
    if (!open || !investigationId) {
      setOverlay(null);
      return;
    }
    let cancelled = false;
    getInvestigationOverlay(investigationId)
      .then((payload) => {
        if (!cancelled) setOverlay(payload);
      })
      .catch(() => {
        if (!cancelled) setOverlay(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, investigationId, overlayRevision]);

  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    const canvas = overlayRef.current;
    if (!video || !canvas) return;

    function paint() {
      const v = videoRef.current;
      const c = overlayRef.current;
      if (!v || !c) return;
      const w = v.clientWidth || 640;
      const h = v.clientHeight || 360;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const ctx = c.getContext("2d");
      if (ctx) drawOverlayPayload(ctx, overlay, w, h);
    }

    paint();
    const id = window.setInterval(paint, 250);
    return () => window.clearInterval(id);
  }, [open, overlay, status]);

  useEffect(() => () => stopSession(), []);

  function pushLog(line: string) {
    setLog((current) => [line, ...current].slice(0, 12));
  }

  function pushContext(ws: WebSocket) {
    const brief = contextBrief.trim();
    if (!brief || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "context", text: brief.slice(0, 1200) }));
    pushLog("Contexte enquête envoyé");
  }

  function handleServer(msg: LiveServerMessage) {
    if (msg.type === "ready") {
      setStatus("live");
      pushLog(`Prêt${msg.model ? ` (${msg.model})` : ""}`);
      const ws = sessionRef.current.ws;
      if (ws) pushContext(ws);
      return;
    }
    if (msg.type === "pong") return;
    if (msg.type === "error") {
      setStatus("error");
      setError(msg.detail || "Erreur Live");
      pushLog(msg.detail || "Erreur Live");
      return;
    }
    if (msg.type === "text" || msg.type === "assistant_transcript") {
      pushLog(`BINTU: ${msg.text}`);
      return;
    }
    if (msg.type === "user_transcript") {
      pushLog(`Vous: ${msg.text}`);
      return;
    }
    if (msg.type === "interrupted") {
      pushLog("Interruption vocale");
      return;
    }
    if (msg.type === "audio" && msg.data) {
      const pcm = new Int16Array(base64ToBytes(msg.data).buffer);
      const session = sessionRef.current;
      session.playChain = session.playChain.then(() => playPcm(pcm));
      return;
    }
    if (msg.type === "batch" && Array.isArray(msg.events)) {
      msg.events.forEach(handleServer);
    }
  }

  async function playPcm(pcm: Int16Array) {
    const session = sessionRef.current;
    const ctx =
      session.audioCtx ?? new AudioContext({ sampleRate: 24000 });
    if (!session.audioCtx) session.audioCtx = ctx;
    const buffer = ctx.createBuffer(1, pcm.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) {
      channel[i] = (pcm[i] ?? 0) / 0x8000;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();
    await new Promise<void>((resolve) => {
      src.onended = () => resolve();
    });
  }

  function stopSession(notify = false) {
    const session = sessionRef.current;
    const wasConnected = session.ws !== null || session.stream !== null;
    if (session.frameTimer != null) {
      window.clearInterval(session.frameTimer);
      session.frameTimer = null;
    }
    try {
      session.processor?.disconnect();
    } catch {
      // ignore
    }
    session.processor = null;
    try {
      void session.audioCtx?.close();
    } catch {
      // ignore
    }
    session.audioCtx = null;
    session.stream?.getTracks().forEach((track) => track.stop());
    session.stream = null;
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: "end" }));
      session.ws.close();
    }
    session.ws = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
    if (notify && wasConnected) onSessionEnd?.();
  }

  async function startSession() {
    setError(null);
    setStatus("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      sessionRef.current.stream = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const token = await currentAccessToken();
      const ws = new WebSocket(buildLiveWebSocketUrl(token));
      sessionRef.current.ws = ws;
      ws.onopen = () => pushLog("WebSocket ouvert");
      ws.onclose = (event) => {
        if (event.code === 4401) {
          setError("Session Live refusée. Reconnectez-vous.");
        } else if (event.code === 4429) {
          setError("Quota Live journalier atteint. Réessayez demain.");
        }
        stopSession();
      };
      ws.onerror = () => {
        setError("Impossible d'ouvrir le Live. Vérifiez GEMINI_API_KEY et le backend.");
        setStatus("error");
      };
      ws.onmessage = (event) => {
        try {
          handleServer(JSON.parse(String(event.data)) as LiveServerMessage);
        } catch {
          pushLog("Message Live illisible");
        }
      };

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      sessionRef.current.audioCtx = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      sessionRef.current.processor = processor;
      processor.onaudioprocess = (event) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const input = event.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i += 1) {
          const sample = Math.max(-1, Math.min(1, input[i] ?? 0));
          pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        ws.send(
          JSON.stringify({
            type: "audio",
            mimeType: "audio/pcm;rate=16000",
            data: bytesToBase64(new Uint8Array(pcm.buffer)),
          }),
        );
      };
      source.connect(processor);
      processor.connect(audioCtx.destination);

      const capture = captureRef.current;
      sessionRef.current.frameTimer = window.setInterval(() => {
        const video = videoRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || !video || !capture) return;
        if (video.videoWidth === 0) return;
        capture.width = video.videoWidth;
        capture.height = video.videoHeight;
        const ctx = capture.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        const dataUrl = capture.toDataURL("image/jpeg", 0.6);
        const data = dataUrl.split(",")[1];
        if (!data) return;
        ws.send(
          JSON.stringify({
            type: "video",
            mimeType: "image/jpeg",
            data,
          }),
        );
      }, 1000);
    } catch (caught) {
      stopSession();
      setStatus("error");
      setError(
        caught instanceof Error
          ? caught.message
          : "Caméra ou micro inaccessible.",
      );
    }
  }

  const actionPrompt = overlay?.action_required?.prompt;

  return (
    <section className="card live-assist" aria-label="Assistance Live">
      <div className="section-heading">
        <span>Live + overlay</span>
        <span className="section-count">Desk & mobile</span>
      </div>
      <p className="live-assist-lead">
        Même contrat que l’app mobile (<code>/api/live</code> + <code>/overlay</code>).
        Ouverture à la demande pour ne pas consommer le quota Live inutilement.
      </p>
      {!open ? (
        <button
          className="button secondary-button"
          type="button"
          onClick={() => setOpen(true)}
        >
          Ouvrir l’assistance Live
        </button>
      ) : (
        <>
          {actionPrompt ? (
            <p className="live-assist-action">
              <Icon name="bolt" size={14} /> {actionPrompt}
            </p>
          ) : null}

          <div className="live-stage">
            <video ref={videoRef} className="live-video" autoPlay playsInline muted />
            <canvas ref={overlayRef} className="live-overlay" aria-hidden="true" />
            <canvas ref={captureRef} className="live-capture" aria-hidden="true" />
          </div>

          <div className="live-assist-actions">
            {status === "idle" || status === "error" ? (
              <button
                className="button primary-button"
                type="button"
                onClick={() => void startSession()}
              >
                Démarrer le Live
              </button>
            ) : (
              <button
                className="button secondary-button"
                type="button"
                onClick={() => stopSession(true)}
              >
                {status === "connecting" ? "Connexion…" : "Arrêter"}
              </button>
            )}
            <button
              className="button text-button"
              type="button"
              onClick={() => {
                stopSession(true);
                setOpen(false);
                setOverlay(null);
                setLog([]);
                setError(null);
              }}
            >
              Masquer
            </button>
          </div>

          {error ? <p className="login-error">{error}</p> : null}

          {log.length > 0 ? (
            <ul className="live-log" aria-label="Journal Live">
              {log.map((line, index) => (
                <li key={`${index}-${line.slice(0, 12)}`}>{line}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
