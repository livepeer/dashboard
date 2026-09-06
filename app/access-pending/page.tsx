import { redirect } from "next/navigation";
import { getAuthenticatedIdentity } from "@/lib/authentication/session";
import { consoleSignInHref, safeReturnTo } from "@/lib/console/auth-login";
import { requireConsoleSession } from "@/lib/console/session-user";
import { WaitingContent, type WaitingState } from "./content";
import { getIdentityReferralUrl } from "@/lib/waitlist/identity-referral";
import type { ProviderIdentity } from "@/lib/platform/contracts";

export const dynamic = "force-dynamic";

export default async function AccessPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; from?: string }>;
}) {
  const params = await searchParams;
  const requested = safeReturnTo(params.returnTo);
  const returnTo = requested.startsWith("/access-pending")
    ? "/home"
    : requested;
  let approved = false;
  let unauthenticated = false;
  let state: WaitingState = "unavailable";
  let referralUrl: string | null = null;
  let identity: ProviderIdentity | null = null;
  try {
    await requireConsoleSession();
    approved = true;
  } catch (error) {
    const failure = error as { status?: number; code?: string } | null;
    unauthenticated = failure?.status === 401;
    if (failure?.code === "access_pending") {
      state = "pending";
      try {
        identity = await getAuthenticatedIdentity();
        if (identity && (!identity.emailVerified || !identity.email))
          state = "verify-email";
        else if (identity) {
          try {
            referralUrl = await getIdentityReferralUrl(identity);
          } catch {
            // An optional referral lookup must not alter the access decision.
            console.error("pending_referral_lookup_failed");
          }
        }
      } catch {
        state = "unavailable";
      }
    } else if (failure?.code === "enrollment_attention_required")
      state = "enrollment-attention";
    else if (failure?.code === "access_revoked") state = "revoked";
    else if (
      failure?.code === "access_disabled" ||
      failure?.code === "canonical_user_disabled"
    )
      state = "disabled";
  }
  if (unauthenticated) redirect(consoleSignInHref({ returnTo }));
  if (approved) redirect(returnTo);
  if (!identity) {
    try {
      identity = await getAuthenticatedIdentity();
    } catch {
      // Missing presentation data never changes the access decision.
    }
  }
  return (
    <WaitingContent
      state={state}
      referralUrl={referralUrl}
      email={identity?.email}
      avatarUrl={identity?.avatarUrl}
    />
  );
}
