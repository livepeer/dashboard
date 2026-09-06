import "server-only";
import { getAuthenticatedIdentity } from "@/lib/authentication/session";
import { resolveProviderIdentity } from "@/lib/identity/provider-user";
import {
  configuredPymthouseScope,
  resolveExternalAccount,
} from "@/lib/external-accounts/service";
import { enrollAuthenticatedUser } from "@/lib/access/enrollment";
import { AccessError, requireApprovedUser } from "@/lib/access/service";

export class SessionRequiredError extends Error {
  readonly status = 401;
  readonly code = "unauthorized";
  constructor() {
    super("Sign in required");
    this.name = "SessionRequiredError";
  }
}
export class CanonicalUserUnavailableError extends AccessError {
  constructor() {
    super("unavailable");
  }
}
export class CanonicalUserDisabledError extends AccessError {
  constructor() {
    super("disabled");
  }
}

/** Authentication can succeed independently. Admission always requires fresh DB truth. */
export async function requireConsoleSession() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) throw new SessionRequiredError();
  try {
    const canonical = await resolveProviderIdentity(identity);
    const enrollment = await enrollAuthenticatedUser(identity, canonical);
    try {
      await requireApprovedUser(canonical.userId);
    } catch (error) {
      // Preserve authoritative approval/revocation/disabled decisions. Only a
      // genuinely pending account needs the neutral enrollment-attention screen.
      if (
        error instanceof AccessError &&
        error.state === "pending" &&
        identity.emailVerified &&
        enrollment?.enrolled === false
      ) {
        throw new AccessError("pending", "enrollment_attention_required");
      }
      throw error;
    }
    const account = await resolveExternalAccount({
      ...configuredPymthouseScope(),
      userId: canonical.userId,
      identityId: canonical.identityId,
    });
    return {
      externalUserId: account.externalUserId,
      canonicalUserId: canonical.userId,
      email: identity.email,
      identity,
    };
  } catch (error) {
    if (error instanceof AccessError) throw error;
    console.error("console_admission_unavailable", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    throw new AccessError("unavailable");
  }
}
export async function requireCanonicalUser() {
  const session = await requireConsoleSession();
  return {
    userId: session.canonicalUserId,
    externalUserId: session.externalUserId,
    email: session.email,
  };
}
