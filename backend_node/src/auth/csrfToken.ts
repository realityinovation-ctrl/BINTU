import { createHmac } from "node:crypto";

import { secretsEqual } from "./secrets";

/** Same token for the whole session. Nothing is stored. */
export function deriveCsrfToken(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionId, "utf8").digest("base64url");
}

export function csrfTokenMatches(
  presented: string,
  sessionId: string,
  secret: string,
): boolean {
  return secretsEqual(presented, deriveCsrfToken(sessionId, secret));
}
