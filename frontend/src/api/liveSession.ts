/**
 * Client Live WebSocket — même contrat que l'app mobile et /live-test.
 * Ne pas inventer de types de messages : desk et mobile partagent le backend.
 *
 * Client → serveur : audio | video | end | text | context | ping
 * Serveur → client : ready | error | text | assistant_transcript | user_transcript
 *                    | interrupted | audio | batch | pong
 * Auth : query ?token=<Bearer> (obligatoire si auth_required).
 */

import { apiBaseUrl, PRODUCTION_API_BASE_URL } from "./baseUrl";

export type LiveClientMessage =
  | {
      type: "audio";
      mimeType: "audio/pcm;rate=16000";
      data: string;
    }
  | {
      type: "video";
      mimeType: "image/jpeg";
      data: string;
    }
  | { type: "end" }
  | { type: "text"; text: string }
  | { type: "context"; text: string }
  | { type: "ping" };

export type LiveServerMessage =
  | { type: "ready"; model?: string }
  | { type: "error"; detail?: string }
  | { type: "text"; text: string }
  | { type: "assistant_transcript"; text: string }
  | { type: "user_transcript"; text: string }
  | { type: "interrupted" }
  | { type: "audio"; data: string; mimeType?: string }
  | { type: "batch"; events: LiveServerMessage[] }
  | { type: "pong" };

export function buildLiveWebSocketUrl(accessToken: string | null): string {
  const configured = apiBaseUrl();
  let base: string;
  if (configured) {
    base = configured;
  } else if (typeof window !== "undefined") {
    // Same-origin → proxy Vite (dev) ou reverse-proxy prod.
    base = window.location.origin;
  } else {
    base = PRODUCTION_API_BASE_URL;
  }
  const wsBase = base.replace(/^http/, "ws");
  const url = new URL(`${wsBase}/api/live`);
  if (accessToken) {
    url.searchParams.set("token", accessToken);
  }
  return url.toString();
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
