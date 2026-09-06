import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { authIdentities, users, waitlistSignups } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import type { ProviderIdentity } from "@/lib/platform/contracts";

/** Read an already-linked enrollment, never link by email or change admission. */
export async function getIdentityReferralUrl(
  identity: ProviderIdentity
): Promise<string | null> {
  if (!identity.emailVerified || !identity.email) return null;
  const [entry] = await getDb()
    .select({ referralCode: waitlistSignups.referralCode })
    .from(authIdentities)
    .innerJoin(users, eq(users.id, authIdentities.userId))
    .innerJoin(waitlistSignups, eq(waitlistSignups.userId, users.id))
    .where(
      and(
        eq(authIdentities.authority, identity.authority),
        eq(authIdentities.issuer, identity.issuer),
        eq(authIdentities.providerSubject, identity.subject),
        eq(users.status, "active"),
        eq(waitlistSignups.status, "confirmed"),
        isNotNull(waitlistSignups.confirmedAt)
      )
    )
    .limit(1);
  if (!entry) return null;
  const url = new URL("/waitlist", getEnv().NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("ref", entry.referralCode);
  return url.toString();
}
