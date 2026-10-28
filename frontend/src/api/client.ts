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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
    throw new APIError(response.status, detail);
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
    },
  );
  if (!response.ok) {
    throw new APIError(response.status, "La transcription a échoué.");
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
    },
  );
  if (!response.ok) {
    throw new APIError(response.status, "L'analyse de l'image a échoué.");
  }
  return (await response.json()) as Investigation;
}
