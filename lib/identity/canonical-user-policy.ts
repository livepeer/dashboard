export function authProviderFromSub(sub: string): string {
  const separator = sub.indexOf("|");
  return separator > 0 ? sub.slice(0, separator) : "auth0";
}

export function normalizeIdentityEmail(
  email: string | undefined
): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

export function chooseCanonicalUserId(input: {
  identityUserId?: string;
  verifiedEmailUserId?: string;
}): string | null {
  // Kept for compatibility; email ownership is never identity-link proof.
  return input.identityUserId ?? null;
}

export function waitlistLinkDecision(input: {
  emailVerified: boolean;
  emailConflict: boolean;
  userId: string;
  waitlistUserId: string | null | undefined;
  waitlistExists: boolean;
}): "skip" | "link" | "already-linked" | "conflict" {
  if (!input.emailVerified || input.emailConflict || !input.waitlistExists) {
    return "skip";
  }
  if (!input.waitlistUserId) return "link";
  return input.waitlistUserId === input.userId ? "already-linked" : "conflict";
}
