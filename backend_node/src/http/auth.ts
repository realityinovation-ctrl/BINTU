import { AuthenticationError, HttpError } from "./errors";
import type { AuthContext, AuthContextProvider } from "./ports";

export class TestAuthContext implements AuthContextProvider {
  constructor(public context: AuthContext | null) {}

  authenticate(): AuthContext {
    if (this.context === null) {
      throw new AuthenticationError("unauthenticated");
    }
    return this.context;
  }
}

export function requirePermission(
  auth: AuthContextProvider,
  permission: string,
): AuthContext & { organizationId: string } {
  let context: AuthContext;
  try {
    context = auth.authenticate();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw new HttpError(401, "Authentication required");
    }
    throw error;
  }
  if (context.organizationId === null || context.organizationId === "") {
    throw new HttpError(403, "Active organization required");
  }
  if (!context.permissions.includes(permission)) {
    throw new HttpError(403, "Permission denied");
  }
  return context as AuthContext & { organizationId: string };
}
