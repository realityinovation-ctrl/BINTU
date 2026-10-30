const KEY = "bintu-session";

export function retireLegacySession() {
  sessionStorage.removeItem(KEY);
  localStorage.removeItem(KEY);
}

export function readSession(): null {
  retireLegacySession();
  return null;
}

export function saveSession(): void {
  retireLegacySession();
}

export function clearSession() {
  retireLegacySession();
}
