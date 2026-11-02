import type { Clock } from "./clock";
import type { Argon2Hasher } from "./passwords";
import type { AuthStore } from "./store";

export interface AuthRuntime {
  store: AuthStore;
  hasher: Argon2Hasher;
  clock: Clock;
  newId: () => string;
  randomBytes: (size: number) => Buffer;
  bootstrapCode: string;
  csrfSecret: string;
  trustedProxies: readonly string[];
  bootstrapAllowMultiple: boolean;
  absoluteMs: number;
  idleMs: number;
  invitationMs: number;
  cookieName: string;
  secureCookie: boolean;
  allowedOrigins: readonly string[];
  limiter: { allow(key: string): boolean };
}

export const AUTHENTICATION_FAILED = "Authentication failed";
export const REGISTRATION_REJECTED = "Registration could not be completed";
export const TOO_MANY_ATTEMPTS = "Too many attempts";
export const CSRF_FAILED = "CSRF validation failed";
export const ORIGIN_REJECTED = "Origin is not allowed";
