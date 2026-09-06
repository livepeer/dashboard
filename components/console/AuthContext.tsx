"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ConsoleSessionProfile } from "@/lib/platform/contracts";

export type AuthProvider = "github" | "google" | "email";
export interface ConsoleUser {
  /** Persisted app-scoped PymtHouse external account ID, supplied by the server. */
  id: string;
  canonicalUserId: string;
  isAdmin: boolean;
  name: string;
  email: string;
  initials: string;
  provider: AuthProvider;
  avatarUrl?: string;
}
interface AuthContextValue {
  isConnected: boolean;
  isLoading: boolean;
  user: ConsoleUser | null;
  disconnect: () => void;
}
const AuthContext = createContext<AuthContextValue>({
  isConnected: false,
  isLoading: true,
  user: null,
  disconnect: () => {},
});
export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ConsoleSessionProfile | null>(null);
  const [isLoading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/console/session", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as ConsoleSessionProfile;
      })
      .then((value) => {
        if (!controller.signal.aborted) setProfile(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setProfile(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  const user = useMemo<ConsoleUser | null>(
    () =>
      profile
        ? {
            id: profile.externalUserId,
            canonicalUserId: profile.userId,
            isAdmin: profile.isAdmin === true,
            name: profile.name,
            email: profile.email,
            provider: profile.provider,
            avatarUrl: profile.avatarUrl,
            initials:
              profile.name
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .toUpperCase()
                .slice(0, 2) || "U",
          }
        : null,
    [profile]
  );
  const disconnect = useCallback(() => {
    window.location.assign("/auth/logout");
  }, []);
  return (
    <AuthContext.Provider
      value={{ isConnected: !!user, isLoading, user, disconnect }}
    >
      {children}
    </AuthContext.Provider>
  );
}
