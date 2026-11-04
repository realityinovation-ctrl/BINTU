"""Proxy phone/browser WebSocket traffic to the Gemini Live API.

Architecture (server-to-server, recommended by Google for production):

  client  --WS-->  BINTU /api/live  --WSS-->  Gemini BidiGenerateContent

The client never sees GEMINI_API_KEY. Frames are JPEG (~1 FPS). Audio is
raw PCM 16-bit little-endian at 16 kHz. Gemini replies with PCM 24 kHz and
optional text transcripts.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

LIVE_WS_HOST = "generativelanguage.googleapis.com"
LIVE_WS_PATH = (
    "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)

DEFAULT_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"

BINTU_LIVE_SYSTEM = """\
Tu es BINTU, guide visuel multimodal en direct (voix + caméra JPEG ~1 FPS).
Tu VOIS l’image. Réponds en français, oral, phrases courtes.

Quand l’utilisateur demande de pointer / encadrer / montrer / flécher quelque chose :
1) Confirme brièvement à l’oral ce que tu cibles.
2) Le client dessine des symboles AR (rectangle, flèche avec phrase, cercle)
   à partir de coordonnées Gemini [ymin, xmin, ymax, xmax] en 0-1000.
   Décris la cible clairement (ex. « je cadre ta tête », « flèche sur le voyant »).
Couleurs : rouge = problème, orange = à vérifier, bleu/blanc = info.

Si on demande ce que tu vois : décris concrètement (personne, objet, voyant…).
Ne dis jamais « je ne vois rien » si des frames arrivent ; si flou, demande
de stabiliser.

Comprendre d’abord la phrase dite (salut inclus) avant le diagnostic.
Ne pas inventer modèle / pièce / panne sans indice.
"""


def _api_key() -> str:
    return (
        os.environ.get("GEMINI_API_KEY", "").strip()
        or os.environ.get("GOOGLE_API_KEY", "").strip()
    )


def _live_model() -> str:
    return (
        os.environ.get("GEMINI_LIVE_MODEL", "").strip()
        or DEFAULT_LIVE_MODEL
    )


def _gemini_uri() -> str:
    key = _api_key()
    if not key:
        raise RuntimeError("GEMINI_API_KEY is required for Gemini Live")
    return f"wss://{LIVE_WS_HOST}{LIVE_WS_PATH}?key={key}"


def _setup_payload() -> dict[str, Any]:
    model = _live_model()
    if not model.startswith("models/"):
        model = f"models/{model}"
    return {
        "setup": {
            "model": model,
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "mediaResolution": "MEDIA_RESOLUTION_MEDIUM",
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {"voiceName": "Puck"}
                    }
                },
            },
            "systemInstruction": {
                "parts": [{"text": BINTU_LIVE_SYSTEM}],
            },
            "inputAudioTranscription": {},
            "outputAudioTranscription": {},
        }
    }


def _strip_b64(data: str) -> str:
    raw = data.strip()
    if "," in raw and raw.lower().startswith("data:"):
        raw = raw.split(",", 1)[1]
    return "".join(raw.split())


def _video_realtime_message(data: str, mime: str) -> str | None:
    """Official Live realtime video blob (JPEG ~1 FPS)."""

    payload = _strip_b64(data)
    if not payload:
        return None
    return json.dumps(
        {
            "realtimeInput": {
                "video": {"data": payload, "mimeType": mime},
            }
        }
    )


def _client_error(detail: str) -> str:
    return json.dumps({"type": "error", "detail": detail}, ensure_ascii=False)


async def _relay_live(client: WebSocket) -> None:
    try:
        import websockets
    except ImportError as exc:
        await client.send_text(
            _client_error("Installez le paquet Python 'websockets' sur le backend.")
        )
        await client.close(code=1011)
        raise RuntimeError("websockets package missing") from exc

    if not _api_key():
        await client.send_text(
            _client_error(
                "Ajoutez GEMINI_API_KEY dans backend/.env puis relancez le serveur."
            )
        )
        await client.close(code=1008)
        return

    uri = _gemini_uri()
    try:
        gemini = await websockets.connect(
            uri,
            max_size=8 * 1024 * 1024,
            ping_interval=20,
            ping_timeout=20,
        )
    except Exception as exc:
        await client.send_text(
            _client_error(f"Connexion Gemini Live impossible: {exc}")
        )
        await client.close(code=1011)
        return

    await gemini.send(json.dumps(_setup_payload()))

    # Official Live contract: wait for setupComplete before any media.
    setup_ok = False
    try:
        while True:
            raw_setup = await asyncio.wait_for(gemini.recv(), timeout=20)
            if isinstance(raw_setup, bytes):
                raw_setup = raw_setup.decode("utf-8", errors="replace")
            try:
                setup_msg = json.loads(raw_setup)
            except json.JSONDecodeError:
                continue
            if "setupComplete" in setup_msg:
                setup_ok = True
                await client.send_text(
                    json.dumps({"type": "setup_complete"}, ensure_ascii=False)
                )
                break
            if setup_msg.get("error"):
                detail = str(setup_msg.get("error"))[:280]
                await client.send_text(_client_error(detail))
                await client.close(code=1011)
                await gemini.close()
                return
    except Exception as exc:
        await client.send_text(
            _client_error(f"Setup Gemini Live échoué: {exc}")
        )
        await client.close(code=1011)
        await gemini.close()
        return

    if not setup_ok:
        await client.send_text(_client_error("Setup Gemini Live incomplet"))
        await client.close(code=1011)
        await gemini.close()
        return

    await client.send_text(
        json.dumps(
            {
                "type": "ready",
                "model": _live_model(),
                "hint": "Audio PCM 16 kHz + JPEG ~1 FPS dans la même session.",
            },
            ensure_ascii=False,
        )
    )

    async def client_to_gemini() -> None:
        while True:
            raw = await client.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await client.send_text(_client_error("JSON client invalide"))
                continue
            kind = message.get("type")
            if kind == "end":
                break
            if kind == "text":
                text = str(message.get("text") or "").strip()
                if not text:
                    continue
                await gemini.send(
                    json.dumps(
                        {
                            "clientContent": {
                                "turns": [
                                    {
                                        "role": "user",
                                        "parts": [{"text": text}],
                                    }
                                ],
                                "turnComplete": True,
                            }
                        }
                    )
                )
                continue
            if kind == "audio":
                data = message.get("data")
                if not isinstance(data, str) or not data:
                    continue
                mime = str(message.get("mimeType") or "audio/pcm;rate=16000")
                await gemini.send(
                    json.dumps(
                        {
                            "realtimeInput": {
                                "audio": {
                                    "data": _strip_b64(data),
                                    "mimeType": mime,
                                }
                            }
                        }
                    )
                )
                continue
            if kind == "video":
                data = message.get("data")
                if not isinstance(data, str) or not data:
                    continue
                mime = str(message.get("mimeType") or "image/jpeg")
                packet = _video_realtime_message(data, mime)
                if packet:
                    await gemini.send(packet)
                continue
            if kind == "ping":
                await client.send_text(json.dumps({"type": "pong"}))
                continue
            if kind == "context":
                brief = str(message.get("text") or "").strip()
                if not brief:
                    continue
                await gemini.send(
                    json.dumps(
                        {
                            "clientContent": {
                                "turns": [
                                    {
                                        "role": "user",
                                        "parts": [
                                            {
                                                "text": (
                                                    "CONTEXTE INVESTIGATION "
                                                    "(mémoire d'attente, ne pas rediscuter) :\n"
                                                    f"{brief}"
                                                )
                                            }
                                        ],
                                    }
                                ],
                                "turnComplete": False,
                            }
                        }
                    )
                )
                continue

    async def gemini_to_client() -> None:
        async for raw in gemini:
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue
            await client.send_text(_normalize_server_event(payload))

    try:
        done, pending = await asyncio.wait(
            [
                asyncio.create_task(client_to_gemini()),
                asyncio.create_task(gemini_to_client()),
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
        for task in done:
            exc = task.exception()
            if exc and not isinstance(exc, (WebSocketDisconnect, asyncio.CancelledError)):
                await client.send_text(_client_error(str(exc)[:280]))
    finally:
        await gemini.close()


def _normalize_server_event(payload: dict[str, Any]) -> str:
    if "setupComplete" in payload:
        return json.dumps({"type": "setup_complete"}, ensure_ascii=False)

    if payload.get("serverContent", {}).get("interrupted"):
        return json.dumps({"type": "interrupted"}, ensure_ascii=False)

    server = payload.get("serverContent") or {}
    model_turn = server.get("modelTurn") or {}
    parts = model_turn.get("parts") or []
    events: list[dict[str, Any]] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        inline = part.get("inlineData") or part.get("inline_data")
        if isinstance(inline, dict) and inline.get("data"):
            events.append(
                {
                    "type": "audio",
                    "data": inline["data"],
                    "mimeType": inline.get("mimeType")
                    or inline.get("mime_type")
                    or "audio/pcm;rate=24000",
                }
            )
        text = part.get("text")
        if isinstance(text, str) and text.strip():
            events.append({"type": "text", "text": text})

    input_tx = server.get("inputTranscription") or server.get("input_transcription")
    if isinstance(input_tx, dict) and input_tx.get("text"):
        events.append({"type": "user_transcript", "text": input_tx["text"]})
    output_tx = server.get("outputTranscription") or server.get("output_transcription")
    if isinstance(output_tx, dict) and output_tx.get("text"):
        events.append({"type": "assistant_transcript", "text": output_tx["text"]})

    if server.get("turnComplete") or server.get("turn_complete"):
        events.append({"type": "turn_complete"})

    if not events:
        return json.dumps({"type": "raw", "payload": payload}, ensure_ascii=False)
    if len(events) == 1:
        return json.dumps(events[0], ensure_ascii=False)
    return json.dumps({"type": "batch", "events": events}, ensure_ascii=False)


LIVE_TEST_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BINTU Live — test caméra + micro</title>
  <style>
    :root { color-scheme: dark; font-family: Segoe UI, sans-serif; }
    body { margin: 0; background: #071426; color: #f4f7ff; }
    main { max-width: 960px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 1.4rem; margin: 0 0 8px; }
    p { color: #9bb0cc; line-height: 1.45; }
    .row { display: flex; gap: 16px; flex-wrap: wrap; }
    video, canvas { width: 100%; max-width: 420px; border-radius: 14px; background: #000; }
    canvas { display: none; }
    .panel { flex: 1; min-width: 280px; background: #10243f; border-radius: 16px; padding: 14px; }
    button { background: #1769ff; color: #fff; border: 0; border-radius: 999px; padding: 10px 16px; font-weight: 700; cursor: pointer; margin-right: 8px; }
    button.stop { background: #f04452; }
    #log { height: 220px; overflow: auto; white-space: pre-wrap; font-size: 13px; background: #0b1b32; border-radius: 12px; padding: 10px; }
    .ok { color: #16c784; }
    .err { color: #f04452; }
  </style>
</head>
<body>
  <main>
    <h1>BINTU Live — test Gemini</h1>
    <p>Proxy local <code>/api/live</code> → Gemini Live. JPEG ~1 FPS + micro PCM 16 kHz. Utilisez un casque pour éviter les boucles audio.</p>
    <div class="row">
      <div class="panel">
        <video id="cam" autoplay playsinline muted></video>
        <canvas id="shot"></canvas>
        <div style="margin-top:12px">
          <button id="start">Démarrer live</button>
          <button id="stop" class="stop" disabled>Arrêter</button>
        </div>
      </div>
      <div class="panel">
        <strong>Journal</strong>
        <div id="log"></div>
      </div>
    </div>
  </main>
  <script>
    const logEl = document.getElementById('log');
    const video = document.getElementById('cam');
    const canvas = document.getElementById('shot');
    const startBtn = document.getElementById('start');
    const stopBtn = document.getElementById('stop');
    let ws, stream, audioCtx, processor, frameTimer, playing = Promise.resolve();

    function log(msg, cls) {
      const line = document.createElement('div');
      if (cls) line.className = cls;
      line.textContent = msg;
      logEl.prepend(line);
    }

    function wsUrl() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      return `${proto}://${location.host}/api/live`;
    }

    async function start() {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      video.srcObject = stream;
      ws = new WebSocket(wsUrl());
      ws.onopen = () => log('WebSocket ouvert', 'ok');
      ws.onclose = () => log('WebSocket fermé');
      ws.onerror = () => log('Erreur WebSocket', 'err');
      ws.onmessage = (ev) => handleServer(JSON.parse(ev.data));

      audioCtx = new AudioContext({ sampleRate: 16000 });
      const source = audioCtx.createMediaStreamSource(stream);
      processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== 1) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        const bytes = new Uint8Array(pcm.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        ws.send(JSON.stringify({
          type: 'audio',
          mimeType: 'audio/pcm;rate=16000',
          data: btoa(binary),
        }));
      };
      source.connect(processor);
      processor.connect(audioCtx.destination);

      const ctx = canvas.getContext('2d');
      frameTimer = setInterval(() => {
        if (!ws || ws.readyState !== 1 || video.videoWidth === 0) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        const data = dataUrl.split(',')[1];
        ws.send(JSON.stringify({ type: 'video', mimeType: 'image/jpeg', data }));
      }, 1000);

      startBtn.disabled = true;
      stopBtn.disabled = false;
    }

    function handleServer(msg) {
      if (msg.type === 'ready') return log(`Prêt (${msg.model})`, 'ok');
      if (msg.type === 'error') return log(msg.detail || 'erreur', 'err');
      if (msg.type === 'text' || msg.type === 'assistant_transcript') return log('BINTU: ' + msg.text);
      if (msg.type === 'user_transcript') return log('Vous: ' + msg.text);
      if (msg.type === 'interrupted') return log('Interruption vocale');
      if (msg.type === 'audio' && msg.data) {
        const bin = atob(msg.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const pcm = new Int16Array(bytes.buffer);
        playing = playing.then(() => playPcm(pcm));
      }
      if (msg.type === 'batch' && Array.isArray(msg.events)) {
        msg.events.forEach(handleServer);
      }
    }

    async function playPcm(pcm) {
      const ctx = audioCtx || new AudioContext({ sampleRate: 24000 });
      const buffer = ctx.createBuffer(1, pcm.length, 24000);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start();
      await new Promise((resolve) => { src.onended = resolve; });
    }

    function stop() {
      clearInterval(frameTimer);
      try { processor && processor.disconnect(); } catch (_) {}
      try { audioCtx && audioCtx.close(); } catch (_) {}
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'end' }));
        ws.close();
      }
      startBtn.disabled = false;
      stopBtn.disabled = true;
      log('Session arrêtée');
    }

    startBtn.onclick = () => start().catch((e) => log(String(e), 'err'));
    stopBtn.onclick = stop;
  </script>
</body>
</html>
"""


def attach_live_routes(
    app: FastAPI,
    *,
    session_authenticator: Any | None = None,
    user_store: Any | None = None,
    require_auth: bool = False,
) -> None:
    @app.get("/live-test", response_class=HTMLResponse)
    def live_test_page() -> HTMLResponse:
        return HTMLResponse(LIVE_TEST_HTML)

    @app.websocket("/api/live")
    async def live_session(websocket: WebSocket) -> None:
        token = (websocket.query_params.get("token") or "").strip()
        user_id: str | None = None
        if session_authenticator is not None and token:
            try:
                context = session_authenticator.authenticate_token(token)
                user_id = context.user_id
            except Exception:
                await websocket.close(code=4401)
                return
        elif require_auth:
            await websocket.close(code=4401)
            return

        await websocket.accept()
        if user_store is not None and user_id:
            try:
                # 1 minute de live consommée à l'ouverture (quota journalier free).
                user_store.consume_live_minutes(user_id, 1.0)
            except Exception as exc:
                detail = getattr(exc, "kind", None) or str(exc)
                try:
                    await websocket.send_text(
                        _client_error(
                            f"Quota live atteint ({detail}). Réessayez demain."
                        )
                    )
                except Exception:
                    pass
                try:
                    await websocket.close(code=4429)
                except Exception:
                    pass
                return
        try:
            await _relay_live(websocket)
        except WebSocketDisconnect:
            return
        except Exception as exc:
            try:
                await websocket.send_text(_client_error(str(exc)[:280]))
            except Exception:
                pass
            try:
                await websocket.close(code=1011)
            except Exception:
                pass
