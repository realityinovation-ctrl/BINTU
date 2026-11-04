/**
 * Accès micro / caméra web — doit être appelé dans le geste utilisateur
 * (click/tap), avant tout await WebSocket, sinon le navigateur refuse.
 *
 * Chrome : http://172.x:8081 = contexte NON sécurisé → mediaDevices absent.
 * Solution : ouvrir https://<IP>:8443 (proxy scripts/https-lan-proxy.mjs).
 */

import { Platform } from 'react-native';

export function isWebMediaRuntime(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined'
  );
}

export function isSecureMediaContext(): boolean {
  if (!isWebMediaRuntime()) return false;
  if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
  const host = window.location.hostname;
  return (
    window.location.protocol === 'https:' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]'
  );
}

/** Conseils si on est encore en http://IP (Chrome bloque getUserMedia). */
export function mediaSecureContextHint(): string | null {
  if (!isWebMediaRuntime()) return null;
  if (isSecureMediaContext()) return null;
  const host = window.location.hostname || 'cette-adresse';
  const httpsPort = '8443';
  const httpsUrl =
    host === 'localhost' || host === '127.0.0.1'
      ? `https://127.0.0.1:${httpsPort}`
      : `https://${host}:${httpsPort}`;
  return (
    `Chrome bloque micro/caméra sur http://${host} (contexte non sécurisé). ` +
    `Ouvrez ${httpsUrl} après avoir lancé « npm run dev:https » dans phone/, ` +
    `ou utilisez http://localhost:8081 sur ce PC.`
  );
}

type Gum = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

function resolveGetUserMedia(): Gum | null {
  if (!isWebMediaRuntime()) return null;
  const md = navigator.mediaDevices;
  if (md && typeof md.getUserMedia === 'function') {
    return (constraints) => md.getUserMedia(constraints);
  }
  // Anciennes APIs (souvent absentes / aussi bloquées hors HTTPS).
  const legacy =
    // @ts-expect-error legacy
    navigator.getUserMedia ||
    // @ts-expect-error legacy
    navigator.webkitGetUserMedia ||
    // @ts-expect-error legacy
    navigator.mozGetUserMedia;
  if (typeof legacy === 'function') {
    return (constraints) =>
      new Promise((resolve, reject) => {
        legacy.call(navigator, constraints, resolve, reject);
      });
  }
  return null;
}

export function canRequestUserMedia(): boolean {
  return resolveGetUserMedia() !== null;
}

export function explainMediaError(error: unknown): string {
  if (!isWebMediaRuntime()) {
    return 'Micro / caméra disponibles sur Chrome web (HTTPS ou localhost).';
  }
  if (!resolveGetUserMedia()) {
    return (
      mediaSecureContextHint() ||
      'Micro / caméra indisponibles : ouvrez BINTU en HTTPS ou via localhost.'
    );
  }
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: string }).name)
      : '';
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    /permission|denied|notallowed/i.test(message)
  ) {
    return 'Autorisez le micro et la caméra pour ce site dans Chrome, puis réessayez.';
  }
  if (name === 'NotFoundError' || /not found|no device/i.test(message)) {
    return 'Aucun micro ou caméra détecté sur cet appareil.';
  }
  if (name === 'NotReadableError' || /track|busy|in use/i.test(message)) {
    return 'La caméra ou le micro est déjà utilisé par une autre application.';
  }
  if (
    name === 'SecurityError' ||
    name === 'TypeError' ||
    /secure|https|mediaDevices/i.test(message)
  ) {
    return (
      mediaSecureContextHint() ||
      'Contexte non sécurisé : utilisez HTTPS (port 8443) ou localhost.'
    );
  }
  if (message && !/micro et caméra sont bloqués/i.test(message)) {
    const hint = mediaSecureContextHint();
    return hint ? `${message}\n\n${hint}` : message;
  }
  return message || mediaSecureContextHint() || 'Impossible d’accéder au micro ou à la caméra.';
}

export async function acquireUserMedia(
  constraints: MediaStreamConstraints,
): Promise<MediaStream> {
  const gum = resolveGetUserMedia();
  if (!gum) {
    throw new Error(
      mediaSecureContextHint() ||
        'Micro / caméra indisponibles sur cette page. Passez en HTTPS (npm run dev:https).',
    );
  }
  try {
    return await gum(constraints);
  } catch (error) {
    throw new Error(explainMediaError(error));
  }
}

export async function acquireMicStream(): Promise<MediaStream> {
  return acquireUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
    },
    video: false,
  });
}

export async function acquireCameraStream(
  facingMode: 'user' | 'environment' = 'environment',
): Promise<MediaStream> {
  try {
    return await acquireUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    });
  } catch (first) {
    if (facingMode === 'environment') {
      try {
        return await acquireUserMedia({
          audio: false,
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch {
        throw first instanceof Error ? first : new Error(explainMediaError(first));
      }
    }
    throw first instanceof Error ? first : new Error(explainMediaError(first));
  }
}

/** Micro + caméra en un seul geste (permissions une seule fois). */
export async function acquireLiveAvStream(
  facingMode: 'user' | 'environment' = 'environment',
): Promise<MediaStream> {
  try {
    return await acquireUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    });
  } catch {
    const video = await acquireCameraStream(facingMode);
    try {
      const audio = await acquireMicStream();
      audio.getAudioTracks().forEach((track) => video.addTrack(track));
      return video;
    } catch {
      return video;
    }
  }
}

export function suggestedHttpsUrl(): string | null {
  if (!isWebMediaRuntime() || isSecureMediaContext()) return null;
  const host = window.location.hostname;
  if (!host) return null;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'https://127.0.0.1:8443';
  }
  return `https://${host}:8443`;
}
