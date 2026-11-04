/**
 * Real-time duplex voice for Gemini Live:
 * mic PCM 16 kHz -> WebSocket, reply PCM 24 kHz -> speaker.
 * Primary path: web / Expo web (getUserMedia + AudioContext).
 */

import { Platform } from 'react-native';
import {
  acquireMicStream,
  explainMediaError,
  isWebMediaRuntime,
} from '@/lib/mediaAccess';

type CaptureHandlers = {
  onPcmBase64: (data: string) => void;
  onError?: (message: string) => void;
};

type CaptureHandle = {
  stop: () => void;
};

type CaptureOptions = {
  /** Stream déjà obtenu dans le geste utilisateur (recommandé). */
  stream?: MediaStream;
};

let playbackCtx: AudioContext | null = null;
let nextPlayAt = 0;
let mediaStream: MediaStream | null = null;
let processor: ScriptProcessorNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let captureCtx: AudioContext | null = null;
/** Si true, stop() ne coupe pas les pistes (stream partagé caméra+micro). */
let ownsTracks = true;

function btoaBinary(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function downsampleTo16k(input: Float32Array, inputRate: number): Int16Array {
  if (inputRate === 16000) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inputRate / 16000;
  const newLen = Math.floor(input.length / ratio);
  const out = new Int16Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const idx = Math.floor(i * ratio);
    const s = Math.max(-1, Math.min(1, input[idx] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function ensurePlaybackCtx(): AudioContext {
  if (!playbackCtx) {
    playbackCtx = new AudioContext({ sampleRate: 24000 });
    nextPlayAt = 0;
  }
  if (playbackCtx.state === 'suspended') {
    void playbackCtx.resume();
  }
  return playbackCtx;
}

export function flushPlayback(): void {
  nextPlayAt = playbackCtx ? playbackCtx.currentTime : 0;
}

export function playPcm16Base64(data: string, sampleRate = 24000): void {
  if (Platform.OS !== 'web' || typeof atob !== 'function') return;
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const ctx = ensurePlaybackCtx();
  const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  const startAt = Math.max(nextPlayAt, ctx.currentTime);
  source.start(startAt);
  nextPlayAt = startAt + buffer.duration;
}

export async function startMicCapture(
  handlers: CaptureHandlers,
  options?: CaptureOptions,
): Promise<CaptureHandle> {
  if (Platform.OS !== 'web') {
    handlers.onError?.(
      'La discussion vocale temps réel est disponible sur Expo Web / navigateur pour l’instant. Sur téléphone natif, utilisez aussi la page /live-test du PC.',
    );
    return { stop: () => undefined };
  }
  const provided = options?.stream;
  let audioOnly: MediaStream;
  try {
    audioOnly = provided
      ? new MediaStream(provided.getAudioTracks())
      : await acquireMicStream();
  } catch (error) {
    const msg = explainMediaError(error);
    handlers.onError?.(msg);
    throw new Error(msg);
  }
  if (!audioOnly.getAudioTracks().length) {
    const msg = 'Aucun micro détecté.';
    handlers.onError?.(msg);
    throw new Error(msg);
  }

  mediaStream = audioOnly;
  ownsTracks = !provided;

  try {
    captureCtx = new AudioContext();
    if (captureCtx.state === 'suspended') {
      await captureCtx.resume();
    }
  } catch (error) {
    if (ownsTracks) {
      audioOnly.getTracks().forEach((track) => track.stop());
    }
    mediaStream = null;
    const msg = explainMediaError(error);
    handlers.onError?.(msg);
    throw new Error(msg);
  }

  const inputRate = captureCtx.sampleRate;
  sourceNode = captureCtx.createMediaStreamSource(mediaStream);
  // ScriptProcessor remains the most portable path for Expo web.
  processor = captureCtx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const pcm = downsampleTo16k(input, inputRate);
    const bytes = new Uint8Array(pcm.buffer);
    handlers.onPcmBase64(btoaBinary(bytes));
  };
  // Keep the node graph alive without playing the mic into the speakers.
  const mute = captureCtx.createGain();
  mute.gain.value = 0;
  sourceNode.connect(processor);
  processor.connect(mute);
  mute.connect(captureCtx.destination);

  return {
    stop: () => {
      try {
        processor?.disconnect();
        sourceNode?.disconnect();
        void captureCtx?.close();
      } catch {
        // ignore teardown races
      }
      processor = null;
      sourceNode = null;
      captureCtx = null;
      if (ownsTracks) {
        mediaStream?.getTracks().forEach((track) => track.stop());
      }
      mediaStream = null;
      ownsTracks = true;
    },
  };
}

export function isRealtimeVoiceSupported(): boolean {
  // Sur http://IP Chrome cache mediaDevices : on reste « supporté » côté UI
  // pour tenter le geste et afficher le bon message / bascule HTTPS.
  return isWebMediaRuntime();
}
