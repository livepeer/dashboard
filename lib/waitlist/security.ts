import { createHash, createHmac, randomBytes } from "node:crypto";

import { getEnv } from "@/lib/env";

export const SESSION_COOKIE = "livepeer_waitlist_session";
export const VERIFICATION_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function randomReferralCode() {
  return randomBytes(9).toString("base64url");
}

export function hashIdentifier(value: string | null) {
  if (!value) return null;
  const secret = getEnv().ATTRIBUTION_HASH_SECRET;
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function analyticsMemberId(signupId: string) {
  return hashIdentifier(`analytics-member:${signupId}`)!;
}

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "Anonymous";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
