import { randomBytes } from "node:crypto";

import type { Clock } from "./clock";
import { sha256Hex } from "./secrets";
import type { AuthStore, SessionRecord } from "./store";

export interface SessionLifetime {
  absoluteMs: number;
  idleMs: number;
}

export interface OpenedSession {
  token: string;
  record: SessionRecord;
}

export function sessionIsActive(
  session: SessionRecord,
  now: Date,
  idleMs: number,
): boolean {
  if (session.revokedAt !== null) {
    return false;
  }
  if (Date.parse(session.expiresAt) <= now.getTime()) {
    return false;
  }
  return now.getTime() - Date.parse(session.lastSeenAt) < idleMs;
}

export function openSession(
  store: AuthStore,
  clock: Clock,
  lifetime: SessionLifetime,
  userId: string,
  organizationId: string,
  bytes: (size: number) => Buffer = randomBytes,
): OpenedSession {
  const now = clock.now();
  const token = bytes(32).toString("base64url");
  const record: SessionRecord = {
    idHash: sha256Hex(token),
    userId,
    organizationId,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + lifetime.absoluteMs).toISOString(),
    revokedAt: null,
  };
  store.insertSession(record);
  return { token, record };
}
