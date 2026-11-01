import type { Clock } from "./clock";
import { isUsableEmail, normalizeEmail } from "./email";
import { isAcceptablePassword, type Argon2Hasher } from "./passwords";
import type { MembershipRole } from "./permissions";
import { secretsEqual, sha256Hex } from "./secrets";
import type { AuthStore } from "./store";

export interface RegistrationInput {
  email: string;
  password: string;
  code: string;
  organizationName?: string;
}

export interface RegistrationDeps {
  store: AuthStore;
  hasher: Argon2Hasher;
  clock: Clock;
  newId: () => string;
  bootstrapCode: string;
}

/**
 * Closed registration. A valid bootstrap code or a single-use invitation
 * is required. An existing email gets the same accepted result and no new row.
 */
export async function registerAccount(
  deps: RegistrationDeps,
  input: RegistrationInput,
): Promise<"accepted" | "rejected"> {
  if (!isUsableEmail(input.email) || !isAcceptablePassword(input.password)) {
    return "rejected";
  }
  const email = normalizeEmail(input.email);
  const passwordHash = await deps.hasher.hash(input.password);
  const now = deps.clock.now().toISOString();
  const invitation = deps.store.findInvitationByCodeHash(sha256Hex(input.code));
  if (
    invitation &&
    invitation.usedAt === null &&
    Date.parse(invitation.expiresAt) > deps.clock.now().getTime()
  ) {
    return acceptInvitation(deps, invitation, email, passwordHash, now);
  }
  if (deps.bootstrapCode !== "" && secretsEqual(input.code, deps.bootstrapCode)) {
    const name = input.organizationName?.trim() ?? "";
    if (name.length === 0 || name.length > 200) {
      return "rejected";
    }
    return acceptBootstrap(deps, email, passwordHash, name, now);
  }
  return "rejected";
}

function acceptInvitation(
  deps: RegistrationDeps,
  invitation: { id: string; organizationId: string; role: MembershipRole },
  email: string,
  passwordHash: string,
  now: string,
): "accepted" | "rejected" {
  if (deps.store.findUserByEmail(email)) {
    return "accepted";
  }
  try {
    return deps.store.transaction(() => {
      const marked = deps.store.markInvitationUsed(invitation.id, now);
      if (!marked) {
        return "rejected" as const;
      }
      const userId = deps.newId();
      deps.store.insertUser({
        id: userId,
        email,
        passwordHash,
        createdAt: now,
        disabledAt: null,
      });
      deps.store.insertMembership({
        userId,
        organizationId: invitation.organizationId,
        role: invitation.role,
        createdAt: now,
      });
      return "accepted" as const;
    });
  } catch (error) {
    if (isConstraint(error)) {
      return "accepted";
    }
    throw error;
  }
}

function acceptBootstrap(
  deps: RegistrationDeps,
  email: string,
  passwordHash: string,
  organizationName: string,
  now: string,
): "accepted" {
  if (deps.store.findUserByEmail(email)) {
    return "accepted";
  }
  try {
    deps.store.transaction(() => {
      const userId = deps.newId();
      const organizationId = deps.newId();
      deps.store.insertUser({
        id: userId,
        email,
        passwordHash,
        createdAt: now,
        disabledAt: null,
      });
      deps.store.insertOrganization({
        id: organizationId,
        name: organizationName,
        createdAt: now,
      });
      deps.store.insertMembership({
        userId,
        organizationId,
        role: "admin",
        createdAt: now,
      });
    });
  } catch (error) {
    if (isConstraint(error)) {
      return "accepted";
    }
    throw error;
  }
  return "accepted";
}

function isConstraint(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String(error.code).includes("CONSTRAINT")
  );
}
