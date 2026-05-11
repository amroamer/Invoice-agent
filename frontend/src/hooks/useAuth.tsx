import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { clearTokens, getAccessToken, setTokens } from "@/api/client";
import { getMe, login as apiLogin, logout as apiLogout, type Me } from "@/api/auth";

type AuthContextValue = {
  me: Me | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      if (!getAccessToken()) {
        setLoading(false);
        return;
      }
      try {
        setMe(await getMe());
      } catch {
        clearTokens();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      loading,
      login: async (username, password) => {
        const pair = await apiLogin(username, password);
        setTokens(pair.access_token, pair.refresh_token);
        setMe(await getMe());
      },
      logout: async () => {
        try {
          await apiLogout();
        } catch {
          /* best-effort */
        }
        clearTokens();
        setMe(null);
      },
    }),
    [me, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
