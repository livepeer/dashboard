"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Theme preference values.
 *  - "light"  / "dark": explicit user choice, ignores OS
 *  - "system": follow `prefers-color-scheme` and re-resolve when it changes
 */
export type ThemePreference = "light" | "dark" | "system";

/** What's actually applied to `<html data-theme="...">`. Always concrete. */
export type ResolvedTheme = "light" | "dark";

/**
 * The three choices, in the order every theme control shows them. Shared by
 * the Appearance settings view and the account menu so they can't drift.
 */
export const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

interface ThemeContextValue {
  /** The user's stored preference. */
  preference: ThemePreference;
  /** The concrete theme currently applied (resolved through `system`). */
  resolved: ResolvedTheme;
  /** True until we've read localStorage on the client; consumers can avoid
   *  flashing UI driven by `preference` during this window. */
  isLoading: boolean;
  /** Persist a new preference and re-apply `data-theme`. */
  setPreference: (p: ThemePreference) => void;
}

// Shared with the root and Console pre-paint theme bootstrap.
const THEME_STORAGE_KEY = "theme";

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  resolved: "dark",
  isLoading: true,
  setPreference: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

/** Read media query result with a SSR-safe fallback. */
function prefersDarkOS(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Combine a user preference with the live OS pref to get a concrete theme. */
function resolvePreference(p: ThemePreference): ResolvedTheme {
  if (p === "light") return "light";
  if (p === "dark") return "dark";
  return prefersDarkOS() ? "dark" : "light";
}

/**
 * ThemeProvider — owns the user's theme preference for the console.
 *
 * Preferences are stored locally; system mode follows OS appearance changes.
 * Explicit light/dark choices override the OS until changed by the user.
 *
 * The `<html data-theme="...">` attribute is set both by an inline script in
 * the console layout (`app/(app)/layout.tsx` — runs before
 * paint, prevents FOUT) and by this provider (keeps the attribute in sync
 * after hydration). The provider is the canonical writer post-mount; the
 * inline script just gets us through the first frame.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default to "system" — concrete value gets re-read from localStorage in
  // useEffect below. Server render uses this fallback.
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");
  const [isLoading, setIsLoading] = useState(true);

  // Apply `data-theme` to <html> whenever resolved changes. The inline script
  // in the layout sets it for the first paint; this keeps it in sync after
  // any state change (user picks a theme, OS pref flips while in "system").
  const applyResolved = useCallback((next: ResolvedTheme) => {
    setResolved(next);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = next;
    }
  }, []);

  // Hydration: read stored preference from localStorage and resolve it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let stored: ThemePreference = "system";
    try {
      const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") {
        stored = raw;
      }
    } catch {
      // localStorage may throw in iframes / private mode — fall through.
    }
    setPreferenceState(stored);
    applyResolved(resolvePreference(stored));
    setIsLoading(false);
  }, [applyResolved]);

  // Subscribe to OS preference changes ONLY while in "system" mode. The
  // listener is torn down whenever the user pins a theme.
  //
  // We deliberately do NOT fire the listener immediately on attach: the
  // hydration effect above has already called `applyResolved(resolvePreference
  // (stored))` with the correct preference. Firing onChange() here would race
  // it — during the first render `preference` is still the initial "system"
  // default (closure-captured), so this effect would re-resolve to OS-pref
  // and clobber the user's persisted choice during the brief two-render
  // hydration window. Listener fires only on future OS changes.
  useEffect(() => {
    if (preference !== "system") return;
    if (typeof window === "undefined") return;
    if (isLoading) return; // wait until hydration committed
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyResolved(prefersDarkOS() ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference, isLoading, applyResolved]);

  const setPreference = useCallback(
    (p: ThemePreference) => {
      setPreferenceState(p);
      applyResolved(resolvePreference(p));
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, p);
      } catch {
        // ignore — preference still applies for the session.
      }
    },
    [applyResolved]
  );

  return (
    <ThemeContext.Provider
      value={{ preference, resolved, isLoading, setPreference }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
