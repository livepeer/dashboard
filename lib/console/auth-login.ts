import { identitySyncPath } from "@/lib/identity/sync-return";

/** SDK login route. Must be a full navigation (`<a>` / `location.assign`),
 *  not a Next.js client transition — middleware mounts `/auth/*`. */
export const AUTH_LOGIN_PATH = "/auth/login";

const DEFAULT_RETURN_TO = "/home";
const INTERNAL_ORIGIN = "http://console.internal";

/** Same-origin relative path only. Rejects protocol-relative and absolute URLs. */
export function safeReturnTo(
  value: string | null | undefined,
  fallback = DEFAULT_RETURN_TO
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed.startsWith("/")) return fallback;
  try {
    const resolved = new URL(trimmed, INTERNAL_ORIGIN);
    return resolved.origin === INTERNAL_ORIGIN
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export function isConsoleAuthPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/auth/")
  );
}

export function authLoginHref(options?: {
  signup?: boolean;
  returnTo?: string;
  loginHint?: string;
  connection?: string;
}): string {
  const params = new URLSearchParams();
  if (options?.signup) params.set("screen_hint", "signup");
  const returnTo = safeReturnTo(options?.returnTo);
  params.set("returnTo", identitySyncPath(returnTo));
  if (options?.loginHint) params.set("login_hint", options.loginHint);
  if (options?.connection) params.set("connection", options.connection);
  return `${AUTH_LOGIN_PATH}?${params.toString()}`;
}

export function consoleSignInHref(options?: { returnTo?: string }): string {
  const returnTo = safeReturnTo(options?.returnTo);
  if (returnTo === DEFAULT_RETURN_TO) return "/login";
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function consoleSignUpHref(options?: { returnTo?: string }): string {
  const returnTo = safeReturnTo(options?.returnTo);
  if (returnTo === DEFAULT_RETURN_TO) return "/signup";
  return `/signup?returnTo=${encodeURIComponent(returnTo)}`;
}

export const AUTH_SIGNIN_HREF = consoleSignInHref();
export const AUTH_SIGNUP_HREF = consoleSignUpHref();
