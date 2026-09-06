import type { ProviderIdentity } from "@/lib/platform/contracts";

/** Canonicalize configured authorities, never accept an issuer from a browser. */
export function normalizeIssuer(value: string): string {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid identity issuer");
  return url.toString().replace(/\/+$/, "");
}

export function validateProviderIdentity(
  input: ProviderIdentity
): ProviderIdentity {
  const authority = input.authority.trim();
  const subject = input.subject.trim();
  if (!authority || !subject)
    throw new Error("Identity authority and subject are required");
  return {
    ...input,
    authority,
    subject,
    issuer: normalizeIssuer(input.issuer),
  };
}

export function auth0IdentityFromUser(
  user: {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    picture?: unknown;
  },
  configuredIssuer: string
): ProviderIdentity | null {
  if (typeof user.sub !== "string" || !user.sub.trim()) return null;
  const issuer = configuredIssuer.includes("://")
    ? configuredIssuer
    : `https://${configuredIssuer}`;
  if (!configuredIssuer.trim())
    throw new Error("Auth0 issuer is not configured");
  const subject = user.sub.trim();
  let avatarUrl: string | undefined;
  if (typeof user.picture === "string") {
    try {
      const picture = new URL(user.picture);
      if (
        picture.protocol === "https:" &&
        !picture.username &&
        !picture.password
      )
        avatarUrl = picture.toString();
    } catch {
      /* Missing or invalid profile images use an initial fallback. */
    }
  }
  return validateProviderIdentity({
    authority: "auth0",
    issuer,
    subject,
    strategy: subject.includes("|") ? subject.split("|", 1)[0] : "auth0",
    email:
      typeof user.email === "string"
        ? user.email.trim() || undefined
        : undefined,
    emailVerified: user.email_verified === true,
    ...(avatarUrl ? { avatarUrl } : {}),
  });
}
