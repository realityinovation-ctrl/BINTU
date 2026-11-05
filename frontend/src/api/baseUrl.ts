/**
 * Base HTTP de l'API BINTU (desk → même runtime que mobile / VPS).
 * Trailing slash retiré pour coller les chemins `/api/...`.
 *
 * - `VITE_API_BASE_URL` défini → cette valeur
 * - chaîne vide → same-origin (proxy Vite)
 * - non défini → API production
 */
export const PRODUCTION_API_BASE_URL = "https://bintu.realityinnovation.fr";

export function apiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return "";
    return trimmed.replace(/\/+$/, "");
  }
  return PRODUCTION_API_BASE_URL;
}

/** URL absolue d'un chemin API (`/api/...`). */
export function apiUrl(path: string): string {
  const base = apiBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
