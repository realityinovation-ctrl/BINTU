import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiUrl } from "../api/baseUrl";
import { setSessionTokenGetter } from "../api/client";
import {
  clearAuthSession,
  readAccessToken,
  readAuthUser,
  writeAccessToken,
  writeAuthUser,
  type AuthUser,
} from "./sessionStore";
import type { UsageQuota } from "./quota";

interface AuthConfig {
  auth_required: boolean;
  google_enabled: boolean;
  google_client_id: string | null;
}

interface AuthSessionResponse {
  access_token: string;
  user: AuthUser;
  quota: UsageQuota;
}

interface AuthMeResponse {
  user: AuthUser;
  quota: UsageQuota;
  auth_required: boolean;
  google_client_id: string | null;
}

interface AuthContextValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  authRequired: boolean;
  googleClientId: string | null;
  bootError: string | null;
  user: AuthUser | null;
  quota: UsageQuota | null;
  refreshQuota: () => Promise<void>;
  signInWithGoogleIdToken: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  markExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const LOCAL_USER: AuthUser = {
  id: "user_local",
  email: "local@bintu.local",
  name: "Technicien local",
  picture_url: null,
  plan: "local",
  organization_id: "org_local",
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init);
  if (!response.ok) {
    let detail = "Authentication failed";
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // keep default
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

const VITE_GOOGLE_CLIENT_ID = String(
  import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
).trim();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [quota, setQuota] = useState<UsageQuota | null>(null);

  const applySession = useCallback(
    (nextUser: AuthUser, token: string | null, nextQuota?: UsageQuota | null) => {
      setUser(nextUser);
      if (nextQuota !== undefined) setQuota(nextQuota);
      if (token) {
        writeAccessToken(token);
        writeAuthUser(nextUser);
      } else {
        clearAuthSession();
      }
    },
    [],
  );

  useEffect(() => {
    setSessionTokenGetter(async () => readAccessToken());
  }, []);

  const refreshQuota = useCallback(async () => {
    const token = readAccessToken();
    if (!token) return;
    try {
      const me = await fetchJson<AuthMeResponse>("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setQuota(me.quota);
      setUser(me.user);
    } catch {
      // keep last known quota
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await fetchJson<AuthConfig>("/api/auth/config");
        if (cancelled) return;
        setBootError(null);
        setAuthRequired(config.auth_required);
        setGoogleClientId(
          config.google_client_id || VITE_GOOGLE_CLIENT_ID || null,
        );

        const token = readAccessToken();
        if (token) {
          try {
            const me = await fetchJson<AuthMeResponse>("/api/auth/me", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (cancelled) return;
            applySession(me.user, token, me.quota);
            setIsLoaded(true);
            return;
          } catch {
            clearAuthSession();
          }
        }

        if (!config.auth_required) {
          applySession(readAuthUser() ?? LOCAL_USER, null, null);
        } else {
          setUser(null);
          setQuota(null);
        }
      } catch {
        if (!cancelled) {
          setBootError(
            "Impossible de joindre l'API BINTU. Vérifiez VITE_API_BASE_URL (VPS) puis rechargez.",
          );
          setAuthRequired(Boolean(VITE_GOOGLE_CLIENT_ID));
          setGoogleClientId(VITE_GOOGLE_CLIENT_ID || null);
          setUser(null);
          setQuota(null);
          clearAuthSession();
        }
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const signInWithGoogleIdToken = useCallback(
    async (idToken: string) => {
      const session = await fetchJson<AuthSessionResponse>("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });
      applySession(session.user, session.access_token, session.quota);
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    const token = readAccessToken();
    if (token) {
      try {
        await fetch(apiUrl("/api/auth/logout"), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // local clear still happens
      }
    }
    clearAuthSession();
    setQuota(null);
    setUser(authRequired ? null : LOCAL_USER);
  }, [authRequired]);

  const markExpired = useCallback(() => {
    clearAuthSession();
    setUser(null);
    setQuota(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoaded,
      isSignedIn: user !== null,
      authRequired,
      googleClientId,
      bootError,
      user,
      quota,
      refreshQuota,
      signInWithGoogleIdToken,
      signOut,
      markExpired,
    }),
    [
      isLoaded,
      user,
      quota,
      authRequired,
      googleClientId,
      bootError,
      refreshQuota,
      signInWithGoogleIdToken,
      signOut,
      markExpired,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthSession(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuthSession must be used within AuthProvider");
  }
  return value;
}
