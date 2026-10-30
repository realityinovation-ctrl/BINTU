import type { Investigation } from "../types/investigation";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export class APIError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "APIError";
  }
}

const DECISION_REJECTED = "Provider decision rejected by Agent Core";

type TokenGetter = () => Promise<string | null>;
type UnauthorizedHandler = () => void;

let tokenGetter: TokenGetter | null = null;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setSessionTokenGetter(getter: TokenGetter | null) {
  tokenGetter = getter;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

async function authorizationHeader(): Promise<Record<string, string>> {
  if (!tokenGetter) return {};
  let token: string | null;
  try {
    token = await tokenGetter();
  } catch {
    onUnauthorized?.();
    throw new APIError(401, "Votre session n'est plus valide.");
  }
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function rejectStatus(status: number, detail: string): never {
  if (status === 401) {
    onUnauthorized?.();
    throw new APIError(status, "Votre session n'est plus valide.");
  }
  if (status === 403) {
    throw new APIError(status, "Cette action n'est pas autorisée.");
  }
  throw new APIError(status, detail);
}

export function decisionFailureMessage(error: unknown): string | null {
  if (error instanceof TypeError) {
    return "Le service IA n'est pas disponible. Réessayez.";
  }
  if (!(error instanceof APIError)) return null;
  if (error.status === 504) {
    return "La décision IA a pris trop de temps. Réessayez.";
  }
  if (error.status === 502) {
    return "Le service IA n'est pas disponible. Réessayez.";
  }
  if (error.status === 500) {
    return "Une erreur interne est survenue.";
  }
  if (error.status === 422 && error.message === DECISION_REJECTED) {
    return "La décision proposée n'est pas valide. Le diagnostic reste inchangé.";
  }
  return null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authorizationHeader()),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let detail = "Une erreur serveur est survenue.";
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // The status code remains the source of truth when no JSON is returned.
    }
    rejectStatus(response.status, detail);
  }

  return (await response.json()) as T;
}

export function createInvestigation(problem: string): Promise<Investigation> {
  return request<Investigation>("/api/investigations", {
    method: "POST",
    body: JSON.stringify({ problem }),
  });
}

export function getInvestigation(id: string): Promise<Investigation> {
  return request<Investigation>(
    `/api/investigations/${encodeURIComponent(id)}`,
  );
}

export function sendMessage(
  id: string,
  message: string,
): Promise<Investigation> {
  return request<Investigation>(
    `/api/investigations/${encodeURIComponent(id)}/message`,
    {
      method: "POST",
      body: JSON.stringify({ message }),
    },
  );
}

export interface MeasurementSubmission {
  measurement_type: string;
  value: number;
  unit: string;
  location: string;
}

export function submitMeasurement(
  id: string,
  measurement: MeasurementSubmission,
): Promise<Investigation> {
  return request<Investigation>(
    `/api/investigations/${encodeURIComponent(id)}/measurement`,
    {
      method: "POST",
      body: JSON.stringify(measurement),
    },
  );
}

export interface SavedInvestigation {
  investigation_id: string;
  status: string;
  updated_at: string;
  problem: string | null;
}

export function listInvestigations(): Promise<SavedInvestigation[]> {
  return request<SavedInvestigation[]>("/api/investigations");
}

export function getHealth(): Promise<{ status: string }> {
  return request<{ status: string }>("/api/health");
}

export async function transcribeAudio(
  id: string,
  audio: Blob,
): Promise<string> {
  const form = new FormData();
  form.append("audio", audio, "recording.wav");
  const response = await fetch(
    `${API_BASE_URL}/api/investigations/${encodeURIComponent(id)}/transcribe`,
    {
      method: "POST",
      body: form,
      headers: await authorizationHeader(),
    },
  );
  if (!response.ok) {
    rejectStatus(response.status, "La transcription a échoué.");
  }
  const body = (await response.json()) as { transcription?: unknown };
  if (
    typeof body.transcription !== "string" ||
    !body.transcription.trim()
  ) {
    throw new APIError(502, "La transcription reçue est invalide.");
  }
  return body.transcription.trim();
}

export async function analyzeImage(
  id: string,
  image: File,
): Promise<Investigation> {
  const form = new FormData();
  form.append("image", image, image.name);
  const response = await fetch(
    `${API_BASE_URL}/api/investigations/${encodeURIComponent(id)}/image`,
    {
      method: "POST",
      body: form,
      headers: await authorizationHeader(),
    },
  );
  if (!response.ok) {
    let detail = "L'analyse de l'image a échoué.";
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail.trim()) {
        detail = body.detail;
      }
    } catch {
      // Keep the status so the screen can choose a safe message.
    }
    rejectStatus(response.status, detail);
  }
  return (await response.json()) as Investigation;
}
