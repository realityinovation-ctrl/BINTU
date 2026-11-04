import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchAuthConfig,
  fetchAuthMe,
  loginWithDeviceId,
  loginWithGoogleIdToken,
  logoutSession,
  type AuthConfig,
} from '@/lib/api';
import {
  clearAuthSession,
  getAccessToken,
  getStoredQuota,
  getStoredUser,
  saveAuthSession,
  type AuthQuota,
  type AuthUser,
} from '@/lib/authSession';
import { getOrCreateDeviceId } from '@/lib/deviceId';

type AuthState = {
  ready: boolean;
  user: AuthUser | null;
  quota: AuthQuota | null;
  config: AuthConfig | null;
  deviceId: string;
  signInWithGoogleToken: (idToken: string) => Promise<void>;
  /** Démarre / reprend la session via l'ID appareil (pas de compte). */
  startWithDevice: () => Promise<void>;
  continueLocal: () => void;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function localDeviceUser(deviceId: string): AuthUser {
  return {
    id: `user_device_${deviceId.slice(0, 12)}`,
    email: `device@bintu.local`,
    name: 'Technicien',
    picture_url: null,
    plan: 'device',
    organization_id: `org_device_${deviceId.slice(0, 12)}`,
  };
}

function unlimitedQuota(): AuthQuota {
  return {
    period_date: 'local',
    messages_used: 0,
    messages_limit: 9999,
    messages_remaining: 9999,
    live_minutes_used: 0,
    live_minutes_limit: 9999,
    live_minutes_remaining: 9999,
    investigations_used: 0,
    investigations_limit: 9999,
    investigations_remaining: 9999,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [quota, setQuota] = useState<AuthQuota | null>(getStoredQuota());
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [deviceId] = useState(() => getOrCreateDeviceId());

  const refreshMe = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setQuota(null);
      return;
    }
    try {
      const me = await fetchAuthMe();
      setUser(me.user);
      setQuota(me.quota);
      saveAuthSession({
        access_token: token,
        user: me.user,
        quota: me.quota,
      });
    } catch {
      clearAuthSession();
      setUser(null);
      setQuota(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchAuthConfig();
        if (!cancelled) setConfig(cfg);
      } catch {
        if (!cancelled) {
          setConfig({
            auth_required: false,
            device_auth: false,
            google_enabled: false,
            google_client_id: null,
          });
        }
      }
      if (getAccessToken()) {
        await refreshMe();
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMe]);

  const signInWithGoogleToken = useCallback(async (idToken: string) => {
    const session = await loginWithGoogleIdToken(idToken);
    saveAuthSession({
      access_token: session.access_token,
      user: session.user,
      quota: session.quota,
    });
    setUser(session.user);
    setQuota(session.quota);
  }, []);

  const continueLocal = useCallback(() => {
    clearAuthSession();
    const localUser = localDeviceUser(deviceId);
    setUser(localUser);
    setQuota(unlimitedQuota());
  }, [deviceId]);

  const startWithDevice = useCallback(async () => {
    const id = getOrCreateDeviceId();
    try {
      const session = await loginWithDeviceId(id);
      saveAuthSession({
        access_token: session.access_token,
        user: session.user,
        quota: session.quota,
      });
      setUser(session.user);
      setQuota(session.quota);
    } catch {
      // API indisponible : mode local lié à l'appareil.
      continueLocal();
    }
  }, [continueLocal]);

  const signOut = useCallback(async () => {
    try {
      await logoutSession();
    } catch {
      // ignore network errors on logout
    }
    clearAuthSession();
    setUser(null);
    setQuota(null);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user,
      quota,
      config,
      deviceId,
      signInWithGoogleToken,
      startWithDevice,
      continueLocal,
      signOut,
      refreshMe,
    }),
    [
      ready,
      user,
      quota,
      config,
      deviceId,
      signInWithGoogleToken,
      startWithDevice,
      continueLocal,
      signOut,
      refreshMe,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
