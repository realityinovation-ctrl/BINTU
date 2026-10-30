import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { publishWaitingCount } from "../attention";

type SignOut = (...args: unknown[]) => Promise<void>;

type ClerkTestState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  orgId: string | null;
  orgRole: string | null;
  orgName: string | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  token: string | null;
  signOut: SignOut;
};

const { clerkState } = vi.hoisted(() => {
  const clerkState: ClerkTestState = {
    isLoaded: true,
    isSignedIn: true,
    userId: "user_test_technician",
    orgId: "org_test_alpha",
    orgRole: "org:technician",
    orgName: "BINTU Demo",
    fullName: "Marc Laurent",
    firstName: "Marc",
    lastName: "Laurent",
    token: "test-session-token",
    signOut: async () => undefined,
  };
  return { clerkState };
});

export function resetClerkState() {
  clerkState.isLoaded = true;
  clerkState.isSignedIn = true;
  clerkState.userId = "user_test_technician";
  clerkState.orgId = "org_test_alpha";
  clerkState.orgRole = "org:technician";
  clerkState.orgName = "BINTU Demo";
  clerkState.fullName = "Marc Laurent";
  clerkState.firstName = "Marc";
  clerkState.lastName = "Laurent";
  clerkState.token = "test-session-token";
  clerkState.signOut = vi.fn(async () => {
    clerkState.isSignedIn = false;
    clerkState.userId = null;
    clerkState.orgId = null;
  }) as SignOut;
}

export { clerkState };

vi.mock("@clerk/react", () => {
  const React = require("react") as typeof import("react");
  return {
    ClerkProvider: ({ children }: { children: import("react").ReactNode }) => children,
    SignIn: () => React.createElement("h1", null, "Connexion"),
    OrganizationList: () => React.createElement("div", null, "Choisir une organisation"),
    OrganizationSwitcher: () =>
      React.createElement("button", { type: "button" }, "Changer d'organisation"),
    useAuth: () => ({
      isLoaded: clerkState.isLoaded,
      isSignedIn: clerkState.isSignedIn,
      userId: clerkState.userId,
      orgId: clerkState.orgId,
      orgRole: clerkState.orgRole,
      getToken: async () => clerkState.token,
      signOut: (...args: unknown[]) => clerkState.signOut(...args),
    }),
    useUser: () => ({
      isLoaded: clerkState.isLoaded,
      isSignedIn: clerkState.isSignedIn,
      user: clerkState.isSignedIn
        ? {
            fullName: clerkState.fullName,
            firstName: clerkState.firstName,
            lastName: clerkState.lastName,
          }
        : null,
    }),
    useOrganization: () => ({
      isLoaded: clerkState.isLoaded,
      organization: clerkState.orgId
        ? { id: clerkState.orgId, name: clerkState.orgName }
        : null,
    }),
  };
});

beforeEach(() => {
  resetClerkState();
});

afterEach(() => {
  publishWaitingCount(0);
  cleanup();
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem("bintu-session");
    localStorage.removeItem("bintu-session");
  }
  if (typeof window !== "undefined") {
    window.history.replaceState({}, "", "/");
  }
});
