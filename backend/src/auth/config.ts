import { PRODUCTION_ARGON2, type Argon2Settings } from "./passwords";
import { parseTrustedProxies } from "./trustedProxy";

export interface AuthSettings {
  production: boolean;
  bootstrapCode: string;
  allowedOrigins: readonly string[];
  absoluteMs: number;
  idleMs: number;
  invitationMs: number;
  argon2: Argon2Settings;
  rateLimit: { max: number; windowMs: number; blockMs: number };
  trustedProxies: readonly string[];
}

const DEVELOPMENT_ORIGIN = "http://localhost:5173";

function integer(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

/** Reads process environment. Empty values keep the documented defaults. */
export function readAuthSettings(env: NodeJS.ProcessEnv): AuthSettings {
  const production = env.BINTU_ENV === "production";
  const configuredOrigins = (env.BINTU_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return {
    production,
    bootstrapCode: env.BINTU_BOOTSTRAP_CODE?.trim() ?? "",
    allowedOrigins:
      configuredOrigins.length > 0
        ? configuredOrigins
        : production
          ? []
          : [DEVELOPMENT_ORIGIN],
    absoluteMs: integer(env.BINTU_SESSION_ABSOLUTE_SECONDS, 12 * 60 * 60) * 1000,
    idleMs: integer(env.BINTU_SESSION_IDLE_SECONDS, 60 * 60) * 1000,
    invitationMs: integer(env.BINTU_INVITATION_SECONDS, 7 * 24 * 60 * 60) * 1000,
    argon2: {
      memoryCost: integer(env.BINTU_ARGON2_MEMORY_KIB, PRODUCTION_ARGON2.memoryCost),
      timeCost: integer(env.BINTU_ARGON2_TIME_COST, PRODUCTION_ARGON2.timeCost),
      parallelism: integer(
        env.BINTU_ARGON2_PARALLELISM,
        PRODUCTION_ARGON2.parallelism,
      ),
    },
    rateLimit: {
      max: integer(env.BINTU_RATE_LIMIT_MAX, 5),
      windowMs: integer(env.BINTU_RATE_LIMIT_WINDOW_SECONDS, 15 * 60) * 1000,
      blockMs: integer(env.BINTU_RATE_LIMIT_BLOCK_SECONDS, 15 * 60) * 1000,
    },
    trustedProxies: parseTrustedProxies(env.BINTU_TRUSTED_PROXIES),
  };
}
