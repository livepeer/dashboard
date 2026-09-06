import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { auth0IdentityFromUser } from "@/lib/authentication/identity";
import { getDb } from "@/lib/db";
import { waitlistSignups } from "@/lib/db/schema";
import {
  configuredPymthouseScope,
  resolveExternalAccount,
} from "@/lib/external-accounts/service";
import { resolveProviderIdentity } from "./provider-user";
import { runBestEffortIdentitySync } from "./best-effort-sync";

export type Auth0IdentityInput = {
  sub: string;
  email?: string;
  emailVerified?: boolean;
};
export type CanonicalUserSyncResult = {
  userId: string;
  identityId?: string;
  accountStatus: "active" | "disabled";
  externalUserId: string;
  identityCreated: boolean;
  waitlistLinked: boolean;
  conflicts: string[];
};

/** Transitional entrypoint for PR46 callers; no subject-derived account fallback. */
export async function syncCanonicalUser(
  input: Auth0IdentityInput
): Promise<CanonicalUserSyncResult> {
  const provider = auth0IdentityFromUser(
    { sub: input.sub, email: input.email, email_verified: input.emailVerified },
    process.env.AUTH0_DOMAIN ?? ""
  );
  if (!provider) throw new Error("Auth0 sub is required");
  const canonical = await resolveProviderIdentity(provider);
  const account = await resolveExternalAccount({
    ...configuredPymthouseScope(),
    userId: canonical.userId,
    identityId: canonical.identityId,
  });
  const conflicts = [...canonical.conflicts];
  let waitlistLinked = false;
  if (canonical.verifiedEmail) {
    await getDb().transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`user:${canonical.userId}`}, 0))`
      );
      const [entry] = await tx
        .select()
        .from(waitlistSignups)
        .where(
          and(
            eq(waitlistSignups.normalizedEmail, canonical.verifiedEmail!),
            eq(waitlistSignups.status, "confirmed")
          )
        )
        .limit(1)
        .for("update");
      if (!entry) return;
      const [other] = await tx
        .select({ id: waitlistSignups.id })
        .from(waitlistSignups)
        .where(eq(waitlistSignups.userId, canonical.userId))
        .limit(1);
      if (
        (entry.userId && entry.userId !== canonical.userId) ||
        (other && other.id !== entry.id)
      ) {
        conflicts.push("waitlist_link");
      } else if (!entry.userId) {
        const linked = await tx
          .update(waitlistSignups)
          .set({ userId: canonical.userId })
          .where(
            and(
              eq(waitlistSignups.id, entry.id),
              isNull(waitlistSignups.userId)
            )
          )
          .returning();
        waitlistLinked = linked.length === 1;
      }
    });
  }
  return {
    ...canonical,
    externalUserId: account.externalUserId,
    waitlistLinked,
    conflicts,
  };
}

export async function syncCanonicalUserBestEffort(
  input: Auth0IdentityInput
): Promise<CanonicalUserSyncResult | null> {
  const result = await runBestEffortIdentitySync(
    () => syncCanonicalUser(input),
    (error) => {
      console.error("canonical_user_sync_failed", {
        errorType: error instanceof Error ? error.name : "unknown",
      });
    }
  );
  if (result?.conflicts.length)
    console.warn("canonical_user_sync_conflict", {
      conflicts: result.conflicts,
    });
  return result;
}
