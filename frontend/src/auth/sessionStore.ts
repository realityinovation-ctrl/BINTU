const TOKEN_KEY = "bintu-access-token";
const USER_KEY = "bintu-auth-user";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  plan: string;
  organization_id: string;
}

export function readAccessToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function writeAccessToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function readAuthUser(): AuthUser | null {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function writeAuthUser(user: AuthUser): void {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}
