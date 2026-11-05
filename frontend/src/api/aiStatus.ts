/** GET /api/ai — statut public partagé desk / mobile (sans secrets). */

import { apiUrl } from "./baseUrl";

export interface AiStatus {
  active: string;
  label: string;
  error: string | null;
  available: string[];
  configured: Record<string, boolean>;
  models: Record<string, string>;
  live: {
    provider: string;
    ready: boolean;
    note?: string;
  };
  assistant_memory?: {
    enabled: boolean;
    backend: string;
    mem0_requested: boolean;
    langgraph?: boolean;
    architecture?: string[];
  };
  switch?: string;
}

export async function fetchAiStatus(): Promise<AiStatus> {
  const response = await fetch(apiUrl("/api/ai"));
  if (!response.ok) {
    throw new Error(`AI status HTTP ${response.status}`);
  }
  return (await response.json()) as AiStatus;
}
