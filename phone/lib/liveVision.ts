/**
 * Live vision — silent JPEG ~1 FPS, cropped to match preview object-fit:cover 16:9.
 * Same crop as the on-screen video so Meta AR coords stay calibrated (eyes, tables…).
 */

import { Platform } from 'react-native';
import {
  acquireCameraStream,
  explainMediaError,
} from '@/lib/mediaAccess';

type Handlers = {
  onJpegBase64: (data: string) => void;
  onError?: (message: string) => void;
  /** Web: same MediaStream drives the visible <video> preview. */
  onPreviewStream?: (stream: MediaStream | null) => void;
};

type CameraLike = {
  takePictureAsync?: (opts: object) => Promise<{ base64?: string } | undefined>;
};

export type LiveVisionHandle = {
  stop: () => void;
};

export type LiveVisionOptions = {
  cameraRef?: { current: CameraLike | null };
  facingMode?: 'user' | 'environment';
  /** Stream déjà obtenu dans le geste utilisateur (recommandé). */
  stream?: MediaStream;
};

/** Must match ArLiveCard / LiveVideoPreview aspect (cover crop). */
export const LIVE_FRAME_ASPECT = 16 / 9;
const TARGET = 768;

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

/** Center crop source frame to target aspect (same math as CSS object-fit: cover). */
function coverSourceRect(
  sw: number,
  sh: number,
  aspect: number,
): { sx: number; sy: number; cw: number; ch: number } {
  const srcAspect = sw / sh;
  if (srcAspect > aspect) {
    const cw = sh * aspect;
    return { sx: (sw - cw) / 2, sy: 0, cw, ch: sh };
  }
  const ch = sw / aspect;
  return { sx: 0, sy: (sh - ch) / 2, cw: sw, ch };
}

export async function startLiveVision(
  handlers: Handlers,
  options?: LiveVisionOptions,
): Promise<LiveVisionHandle> {
  if (
    Platform.OS === 'web' &&
    typeof document !== 'undefined' &&
    typeof navigator !== 'undefined'
  ) {
    return startWebVision(
      handlers,
      options?.facingMode ?? 'environment',
      options?.stream,
    );
  }
  return startNativeSilentVision(handlers, options?.cameraRef);
}

async function startWebVision(
  handlers: Handlers,
  facingMode: 'user' | 'environment',
  provided?: MediaStream,
): Promise<LiveVisionHandle> {
  let stream: MediaStream;
  let ownsTracks = false;
  try {
    if (provided?.getVideoTracks().length) {
      stream = provided;
    } else {
      stream = await acquireCameraStream(facingMode);
      ownsTracks = true;
    }
  } catch (error) {
    const msg = explainMediaError(error);
    handlers.onError?.(msg);
    throw new Error(msg);
  }

  handlers.onPreviewStream?.(stream);

  const sampler = document.createElement('video');
  sampler.playsInline = true;
  sampler.muted = true;
  sampler.autoplay = true;
  sampler.srcObject = stream;
  sampler.setAttribute('aria-hidden', 'true');
  sampler.style.cssText =
    'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-100vw;top:-100vh';
  document.body.appendChild(sampler);
  await sampler.play().catch(() => undefined);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let timer: ReturnType<typeof setInterval> | null = null;
  let sending = false;

  const tick = () => {
    if (!ctx || sending) return;
    if (!sampler.videoWidth || !sampler.videoHeight) return;

    const { sx, sy, cw, ch } = coverSourceRect(
      sampler.videoWidth,
      sampler.videoHeight,
      LIVE_FRAME_ASPECT,
    );
    const scale = Math.min(1, TARGET / Math.max(cw, ch));
    const w = Math.max(16, Math.round(cw * scale));
    const h = Math.max(16, Math.round(ch * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(sampler, sx, sy, cw, ch, 0, 0, w, h);
    sending = true;
    try {
      handlers.onJpegBase64(dataUrlToBase64(canvas.toDataURL('image/jpeg', 0.7)));
    } catch (error) {
      handlers.onError?.(
        error instanceof Error ? error.message : 'Capture JPEG impossible',
      );
    } finally {
      sending = false;
    }
  };

  timer = setInterval(tick, 1000);
  sampler.onloadeddata = () => tick();

  return {
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
      handlers.onPreviewStream?.(null);
      if (ownsTracks) {
        stream.getTracks().forEach((track) => track.stop());
      }
      sampler.srcObject = null;
      sampler.remove();
    },
  };
}

/**
 * Native: never call takePictureAsync for Live (it freezes the preview).
 * Preview stays on CameraView; optional rare silent grabs only if needed later.
 */
function startNativeSilentVision(
  handlers: Handlers,
  _cameraRef?: { current: CameraLike | null },
): LiveVisionHandle {
  handlers.onPreviewStream?.(null);
  return { stop: () => undefined };
}
