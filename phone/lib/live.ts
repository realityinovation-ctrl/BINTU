import { apiBase } from '@/lib/api';
import { getAccessToken } from '@/lib/authSession';

export type LiveServerEvent =
  | { type: 'ready'; model?: string; hint?: string }
  | { type: 'error'; detail: string }
  | { type: 'text'; text: string }
  | { type: 'user_transcript'; text: string }
  | { type: 'assistant_transcript'; text: string }
  | { type: 'audio'; data: string; mimeType?: string }
  | { type: 'interrupted' }
  | { type: 'turn_complete' }
  | { type: 'setup_complete' }
  | { type: 'pong' }
  | { type: 'batch'; events: LiveServerEvent[] }
  | { type: 'raw'; payload: unknown };

export function liveWsUrl(): string {
  // apiBase() = …/api → Live = …/api/live
  const http = apiBase();
  let base: string;
  if (http.startsWith('https://')) {
    base = `wss://${http.slice('https://'.length)}/live`;
  } else if (http.startsWith('http://')) {
    base = `ws://${http.slice('http://'.length)}/live`;
  } else {
    base = `ws://${http}/live`;
  }
  const token = getAccessToken();
  if (!token) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}

export type LiveSession = {
  ready: Promise<void>;
  sendVideoJpegBase64: (data: string) => void;
  sendAudioPcmBase64: (data: string, mimeType?: string) => void;
  sendText: (text: string) => void;
  sendContext: (text: string) => void;
  close: () => void;
};

export function openLiveSession(handlers: {
  onEvent?: (event: LiveServerEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (message: string) => void;
}): LiveSession {
  const socket = new WebSocket(liveWsUrl());
  let open = false;
  let sessionReady = false;
  let resolveReady: () => void = () => undefined;
  let rejectReady: (error: Error) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const markReady = () => {
    if (sessionReady) return;
    sessionReady = true;
    resolveReady();
  };

  socket.onopen = () => {
    open = true;
    handlers.onOpen?.();
  };
  socket.onclose = () => {
    open = false;
    if (!sessionReady) {
      rejectReady(new Error('Connexion Live fermée avant setup'));
    }
    handlers.onClose?.();
  };
  socket.onerror = () => {
    rejectReady(new Error('Connexion Live impossible'));
    handlers.onError?.('Connexion Live impossible');
  };
  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as LiveServerEvent;
      if (payload.type === 'ready' || payload.type === 'setup_complete') {
        markReady();
      }
      if (payload.type === 'error') {
        rejectReady(new Error(payload.detail));
      }
      if (payload.type === 'batch' && Array.isArray(payload.events)) {
        payload.events.forEach((item) => {
          if (item.type === 'ready' || item.type === 'setup_complete') markReady();
          handlers.onEvent?.(item);
        });
        return;
      }
      handlers.onEvent?.(payload);
    } catch {
      handlers.onError?.('Événement Live invalide');
    }
  };

  const send = (body: Record<string, unknown>) => {
    if (!open || !sessionReady || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(body));
  };

  return {
    ready,
    sendVideoJpegBase64: (data) => {
      send({ type: 'video', mimeType: 'image/jpeg', data });
    },
    sendAudioPcmBase64: (data, mimeType = 'audio/pcm;rate=16000') => {
      send({ type: 'audio', mimeType, data });
    },
    sendText: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      send({ type: 'text', text: trimmed });
    },
    sendContext: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      send({ type: 'context', text: trimmed });
    },
    close: () => {
      if (socket.readyState === WebSocket.OPEN) {
        send({ type: 'end' });
        socket.close();
      }
      open = false;
    },
  };
}
