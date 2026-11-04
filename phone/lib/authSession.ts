import { Platform } from 'react-native';

const TOKEN_KEY = 'bintu_access_token';
const USER_KEY = 'bintu_user_json';
const QUOTA_KEY = 'bintu_quota_json';

let memoryToken: string | null = null;
let memoryUser: string | null = null;
let memoryQuota: string | null = null;

function webStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  return localStorage;
}

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  plan: string;
  organization_id: string;
};

export type AuthQuota = {
  period_date: string;
  messages_used: number;
  messages_limit: number;
  messages_remaining: number;
  live_minutes_used: number;
  live_minutes_limit: number;
  live_minutes_remaining: number;
  investigations_used: number;
  investigations_limit: number;
  investigations_remaining: number;
};

export function getAccessToken(): string | null {
  const web = webStorage();
  if (web) return web.getItem(TOKEN_KEY);
  return memoryToken;
}

export function getStoredUser(): AuthUser | null {
  const raw = webStorage()?.getItem(USER_KEY) ?? memoryUser;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function getStoredQuota(): AuthQuota | null {
  const raw = webStorage()?.getItem(QUOTA_KEY) ?? memoryQuota;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthQuota;
  } catch {
    return null;
  }
}

export function saveAuthSession(input: {
  access_token: string;
  user: AuthUser;
  quota: AuthQuota;
}): void {
  memoryToken = input.access_token;
  memoryUser = JSON.stringify(input.user);
  memoryQuota = JSON.stringify(input.quota);
  const web = webStorage();
  if (web) {
    web.setItem(TOKEN_KEY, input.access_token);
    web.setItem(USER_KEY, memoryUser);
    web.setItem(QUOTA_KEY, memoryQuota);
  }
}

export function clearAuthSession(): void {
  memoryToken = null;
  memoryUser = null;
  memoryQuota = null;
  const web = webStorage();
  web?.removeItem(TOKEN_KEY);
  web?.removeItem(USER_KEY);
  web?.removeItem(QUOTA_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
