"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  captureEvent,
  identifyMember,
  resetAnalyticsIdentity,
} from "@/lib/analytics";
import type {
  WaitlistMessageResponse,
  WaitlistSessionResponse,
  WaitlistSignupRequest,
} from "@/lib/waitlist/contracts";

type WaitlistState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "submitting" }
  | { status: "verification-pending"; email: string }
  | { status: "signed-in"; data: WaitlistSessionResponse }
  | { status: "error"; message: string };

type WaitlistContextValue = {
  state: WaitlistState;
  join: (
    email: string,
    options?: {
      authOnly?: boolean;
      company?: string;
      newsletterOptIn?: boolean;
    }
  ) => Promise<void>;
  signOut: () => Promise<void>;
  signingOut: boolean;
  signOutError: string | null;
  reset: () => void;
};

const WaitlistContext = createContext<WaitlistContextValue | null>(null);
const attributionKeys = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export function WaitlistSessionProvider({
  children,
  initialSession,
}: {
  children: ReactNode;
  initialSession: WaitlistSessionResponse | null;
}) {
  const [state, setState] = useState<WaitlistState>(() =>
    initialSession
      ? { status: "signed-in", data: initialSession }
      : { status: "signed-out" }
  );
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const identifiedMemberRef = useRef<string | null>(null);

  const loadSession = useCallback(async (preservePending = false) => {
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      if (response.status === 401) {
        setState((current) =>
          preservePending && current.status === "verification-pending"
            ? current
            : { status: "signed-out" }
        );
        return;
      }
      const result = (await response.json()) as
        | WaitlistSessionResponse
        | WaitlistMessageResponse;
      if (!response.ok || !("member" in result)) {
        throw new Error(
          "message" in result ? result.message : "Couldn’t load your place."
        );
      }
      setState({ status: "signed-in", data: result });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Couldn’t load your place.",
      });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (
        process.env.NODE_ENV !== "production" &&
        params.get("preview") === "email-sent"
      ) {
        setState({
          status: "verification-pending",
          email: params.get("email") || "you@example.com",
        });
        return;
      }
      if (params.get("verification") === "invalid") {
        setState({
          status: "error",
          message:
            "This verification link is invalid or expired. Enter your email to request a new one.",
        });
        return;
      }
      if (!initialSession) void loadSession();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialSession, loadSession]);

  useEffect(() => {
    if (state.status !== "signed-in") return;
    const { member } = state.data;
    if (identifiedMemberRef.current === member.analyticsId) return;
    identifyMember(member.analyticsId, {
      referral_code: member.referralCode,
      newsletter_opt_in: member.newsletterOptIn,
    });
    identifiedMemberRef.current = member.analyticsId;
  }, [state]);

  useEffect(() => {
    function refreshVisibleSession() {
      if (document.visibilityState === "visible") void loadSession(true);
    }

    window.addEventListener("focus", refreshVisibleSession);
    window.addEventListener("pageshow", refreshVisibleSession);
    document.addEventListener("visibilitychange", refreshVisibleSession);
    return () => {
      window.removeEventListener("focus", refreshVisibleSession);
      window.removeEventListener("pageshow", refreshVisibleSession);
      document.removeEventListener("visibilitychange", refreshVisibleSession);
    };
  }, [loadSession]);

  const join = useCallback(
    async (
      email: string,
      options?: {
        authOnly?: boolean;
        company?: string;
        newsletterOptIn?: boolean;
      }
    ) => {
      const normalizedEmail = email.trim().toLowerCase();
      setState({ status: "submitting" });
      const params = new URLSearchParams(window.location.search);
      const attribution: Record<string, string> = {
        landing_page: `${window.location.pathname}${window.location.search}`,
      };
      for (const key of attributionKeys) {
        const value = params.get(key);
        if (value) attribution[key] = value;
      }
      if (document.referrer) attribution.referrer = document.referrer;

      const payload: WaitlistSignupRequest = {
        email: normalizedEmail,
        newsletterOptIn: options?.newsletterOptIn ?? false,
        referralCode: params.get("ref") || undefined,
        company: options?.company,
        attribution,
        authOnly: options?.authOnly,
      };

      try {
        const response = await fetch("/api/waitlist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = response.headers
          .get("content-type")
          ?.includes("application/json")
          ? ((await response.json()) as Partial<WaitlistMessageResponse>)
          : {};
        if (!response.ok) {
          throw new Error(
            result.message || "We couldn’t send the verification email."
          );
        }
        setState({ status: "verification-pending", email: normalizedEmail });
        if (!options?.authOnly) {
          captureEvent("waitlist_signup_submitted", {
            ...attribution,
            newsletter_opt_in: options?.newsletterOptIn ?? false,
            referred: Boolean(payload.referralCode),
          });
        }
      } catch (error) {
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Something went wrong. Please try again.",
        });
        throw error;
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      const response = await fetch("/api/logout", { method: "POST" });
      if (!response.ok) throw new Error("Couldn’t sign out. Please try again.");
      resetAnalyticsIdentity();
      identifiedMemberRef.current = null;
      setState({ status: "signed-out" });
    } catch (error) {
      setSignOutError(
        error instanceof Error
          ? error.message
          : "Couldn’t sign out. Please try again."
      );
    } finally {
      setSigningOut(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      state,
      join,
      signOut,
      signingOut,
      signOutError,
      reset: () => setState({ status: "signed-out" }),
    }),
    [join, signOut, signOutError, signingOut, state]
  );

  return (
    <WaitlistContext.Provider value={value}>
      {children}
    </WaitlistContext.Provider>
  );
}

export function useWaitlistSession() {
  const value = useContext(WaitlistContext);
  if (!value) {
    throw new Error(
      "useWaitlistSession must be used within WaitlistSessionProvider"
    );
  }
  return value;
}
