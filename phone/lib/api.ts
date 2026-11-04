import {
  authHeaders,
  type AuthQuota,
  type AuthUser,
} from '@/lib/authSession';

/** API en ligne uniquement (VPS). Chemins : /investigations, /auth/… */
export const DEFAULT_API_BASE = 'https://bintu.realityinnovation.fr/api';

export type PendingAction = {
  tool_name: string;
  arguments: Record<string, unknown>;
  reason?: string;
};

export type AssistantContext = {
  working_summary?: string;
  entities?: Record<string, { value?: string } | string>;
  long_term_notes?: string[];
  recent_utterances?: string[];
};

export type TimelineEvent = {
  sequence?: number;
  event_type: string;
  summary: string;
  details?: Record<string, unknown>;
};

export type Investigation = {
  investigation_id: string;
  status: string;
  state: {
    problem: { description: string } | null;
    pending_action: PendingAction | null;
    conclusion: { diagnosis: string; confidence: number } | null;
    observations: { statement: string }[];
    assistant_context?: AssistantContext | null;
    timeline?: TimelineEvent[];
  };
};

export type ConversationTurn = {
  id?: number;
  role: 'user' | 'assistant' | 'technician' | 'system' | string;
  content: string;
  created_at: string;
  kind?: string | null;
};

export type ConversationPayload = {
  investigation_id: string;
  turns: ConversationTurn[];
};

export function memoryBrief(item: Investigation): string {
  const ctx = item.state.assistant_context;
  const lines: string[] = [];
  if (item.state.problem?.description) {
    lines.push(`Problème: ${item.state.problem.description}`);
  }
  const pending = item.state.pending_action;
  if (pending?.tool_name === 'ask_technician') {
    lines.push(`Question en attente: ${String(pending.arguments.question ?? '')}`);
  }
  if (ctx?.working_summary) lines.push(`Résumé: ${ctx.working_summary}`);
  if (ctx?.entities) {
    const packed = Object.entries(ctx.entities)
      .map(([key, value]) => {
        const text = typeof value === 'string' ? value : value?.value;
        return text ? `${key}=${text}` : '';
      })
      .filter(Boolean)
      .join(' ; ');
    if (packed) lines.push(`Entités: ${packed}`);
  }
  if (ctx?.recent_utterances?.length) {
    lines.push(`Derniers échanges: ${ctx.recent_utterances.slice(-4).join(' | ')}`);
  }
  return lines.join('\n').slice(0, 1200);
}

export type InvestigationSummary = {
  investigation_id: string;
  status: string;
  updated_at: string;
  problem: string | null;
  has_report?: boolean;
  diagnosis?: string | null;
};

export type OverlayPayload = {
  step_id: string;
  confidence_score: number;
  hypothesis: string;
  overlay_instructions: {
    frame_dimensions?: { width: number; height: number };
    coordinate_space?: string;
    elements?: Array<Record<string, any>>;
  };
  action_required: {
    type: string;
    prompt: string;
    unit: string | null;
  };
};

function normalizeApiBase(raw: string): string {
  let base = raw.trim().replace(/\/+$/, '');
  if (!/\/api$/i.test(base)) {
    base = `${base}/api`;
  }
  return base;
}

/** Racine API en ligne — plus de fallback localhost. */
export function apiBase(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  return normalizeApiBase(configured || DEFAULT_API_BASE);
}

/** Origine sans /api (pages hors API, ex. /live-test). */
export function apiOrigin(): string {
  return apiBase().replace(/\/api$/i, '') || apiBase();
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = 'Le serveur BINTU a refusé la requête.';
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // The status remains the useful signal.
    }
    throw new Error(detail);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function createInvestigation(problem: string): Promise<Investigation> {
  return fetch(`${apiBase()}/investigations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ problem }),
  }).then((response) => parse<Investigation>(response));
}

export function getInvestigation(id: string): Promise<Investigation> {
  return fetch(`${apiBase()}/investigations/${encodeURIComponent(id)}`, {
    headers: { ...authHeaders() },
  }).then((response) => parse<Investigation>(response));
}

export function getConversation(id: string): Promise<ConversationPayload> {
  return fetch(
    `${apiBase()}/investigations/${encodeURIComponent(id)}/conversation`,
    { headers: { ...authHeaders() } },
  ).then((response) => parse<ConversationPayload>(response));
}

export function sendMessage(
  id: string,
  message: string,
  options?: { commit?: boolean },
): Promise<Investigation> {
  const commit = options?.commit ?? true;
  return fetch(`${apiBase()}/investigations/${encodeURIComponent(id)}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message, commit }),
  }).then((response) => parse<Investigation>(response));
}

export function submitMeasurement(
  id: string,
  measurement: {
    measurement_type: string;
    value: number;
    unit: string;
    location: string;
  },
): Promise<Investigation> {
  return fetch(`${apiBase()}/investigations/${encodeURIComponent(id)}/measurement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(measurement),
  }).then((response) => parse<Investigation>(response));
}

export function uploadImage(id: string, file: FormData): Promise<Investigation> {
  return fetch(`${apiBase()}/investigations/${encodeURIComponent(id)}/image`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: file,
  }).then((response) => parse<Investigation>(response));
}

export function listInvestigations(): Promise<InvestigationSummary[]> {
  return fetch(`${apiBase()}/investigations`, {
    headers: { ...authHeaders() },
  }).then((response) => parse<InvestigationSummary[]>(response));
}

export function getOverlay(id: string): Promise<OverlayPayload> {
  return fetch(`${apiBase()}/investigations/${encodeURIComponent(id)}/overlay`, {
    headers: { ...authHeaders() },
  }).then((response) => parse<OverlayPayload>(response));
}

/** Finalise la session Live/chat et crée le rapport (diagnostic conclu). */
export function generateReport(
  id: string,
  message = 'Générer le rapport d’intervention.',
): Promise<Investigation> {
  return fetch(
    `${apiBase()}/investigations/${encodeURIComponent(id)}/report/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ message, commit: true }),
    },
  ).then((response) => parse<Investigation>(response));
}

export type ReportPresentation = {
  equipment?: string;
  problem?: string | null;
  cause?: string;
  solution?: string;
  actions?: string[];
  summary?: string;
  confidence_percent?: number;
  images?: number;
};

export type InvestigationReportPayload = {
  problem?: string | null;
  diagnosis?: string | null;
  confidence?: number | null;
  presentation?: ReportPresentation;
  meta?: Record<string, unknown>;
};

/** Rapport structuré (cause/solution propres + meta images). */
export function getInvestigationReport(
  id: string,
): Promise<InvestigationReportPayload> {
  return fetch(`${apiBase()}/investigations/${encodeURIComponent(id)}/report`, {
    headers: { ...authHeaders() },
  }).then((response) => parse<InvestigationReportPayload>(response));
}

/** URL du PDF professionnel (diagnostic conclu uniquement). */
export function reportPdfUrl(id: string): string {
  return `${apiBase()}/investigations/${encodeURIComponent(id)}/report.pdf`;
}

/** Télécharge le PDF généré côté backend. */
export async function downloadReportPdf(id: string): Promise<Blob> {
  const response = await fetch(reportPdfUrl(id), {
    headers: { ...authHeaders() },
  });
  if (!response.ok) {
    let detail = 'Rapport PDF indisponible.';
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // keep default
    }
    throw new Error(detail);
  }
  return response.blob();
}

export function requestVisionBoxes(input: {
  image_base64: string;
  hint?: string;
  content_type?: string;
}): Promise<{ overlays: Array<Record<string, unknown>> }> {
  return fetch(`${apiBase()}/vision/boxes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      image_base64: input.image_base64,
      hint: input.hint ?? '',
      content_type: input.content_type ?? 'image/jpeg',
    }),
  }).then((response) => parse<{ overlays: Array<Record<string, unknown>> }>(response));
}

export type AuthConfig = {
  auth_required: boolean;
  device_auth?: boolean;
  google_enabled: boolean;
  google_client_id: string | null;
};

export type AuthSessionPayload = {
  access_token: string;
  expires_at: string;
  token_type: string;
  user: AuthUser;
  quota: AuthQuota;
};

export type AuthMePayload = {
  user: AuthUser;
  quota: AuthQuota;
  auth_required: boolean;
  google_client_id: string | null;
};

export function fetchAuthConfig(): Promise<AuthConfig> {
  return fetch(`${apiBase()}/auth/config`).then((response) =>
    parse<AuthConfig>(response),
  );
}

export function loginWithGoogleIdToken(
  idToken: string,
): Promise<AuthSessionPayload> {
  return fetch(`${apiBase()}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  }).then((response) => parse<AuthSessionPayload>(response));
}

/** Connexion sans compte : l'appareil devient l'identité. */
export function loginWithDeviceId(
  deviceId: string,
): Promise<AuthSessionPayload> {
  return fetch(`${apiBase()}/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  }).then((response) => parse<AuthSessionPayload>(response));
}

export function fetchAuthMe(): Promise<AuthMePayload> {
  return fetch(`${apiBase()}/auth/me`, {
    headers: { ...authHeaders() },
  }).then((response) => parse<AuthMePayload>(response));
}

export function logoutSession(): Promise<void> {
  return fetch(`${apiBase()}/auth/logout`, {
    method: 'POST',
    headers: { ...authHeaders() },
  }).then(async (response) => {
    if (!response.ok && response.status !== 204) {
      await parse(response);
    }
  });
}
