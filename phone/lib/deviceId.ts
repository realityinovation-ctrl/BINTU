import { Platform } from 'react-native';

const DEVICE_KEY = 'bintu_device_id';
let memoryDeviceId: string | null = null;

function webStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  return localStorage;
}

function newDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** ID stable de l'appareil (localStorage / mémoire). Pas de compte utilisateur. */
export function getOrCreateDeviceId(): string {
  const web = webStorage();
  const existing = web?.getItem(DEVICE_KEY) ?? memoryDeviceId;
  if (existing && existing.length >= 8) {
    memoryDeviceId = existing;
    return existing;
  }
  const created = newDeviceId();
  memoryDeviceId = created;
  web?.setItem(DEVICE_KEY, created);
  return created;
}
