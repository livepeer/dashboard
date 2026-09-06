import "server-only";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  accessEvents,
  accessGrants,
  emailSubscriptions,
  pointEvents,
  userEmails,
  waitlistSignups,
} from "@/lib/db/schema";
import type {
  CanonicalIdentity,
  ProviderIdentity,
  WaitlistEnrollmentContext,
} from "@/lib/platform/contracts";
import { normalizeEmail, randomReferralCode } from "@/lib/waitlist/security";

export async function enrollAuthenticatedUser(
  identity: ProviderIdentity,
  canonical: CanonicalIdentity,
  context?: WaitlistEnrollmentContext
): Promise<{ enrolled: boolean; signupId?: string; reason?: string }> {
  if (
    !identity.emailVerified ||
    !identity.email ||
    canonical.accountStatus === "disabled"
  )
    return { enrolled: false, reason: "unverified_or_disabled" };
  const normalizedEmail = normalizeEmail(identity.email);
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`email:${normalizedEmail}`}, 0))`
    );
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`user:${canonical.userId}`}, 0))`
    );
    const [email] = await tx
      .select()
      .from(userEmails)
      .where(
        and(
          eq(userEmails.userId, canonical.userId),
          eq(userEmails.normalizedEmail, normalizedEmail),
          isNotNull(userEmails.verifiedAt)
        )
      )
      .limit(1);
    if (!email || canonical.conflicts.includes("verified_email"))
      return { enrolled: false, reason: "email_conflict" };
    const rows = await tx
      .select()
      .from(waitlistSignups)
      .where(
        or(
          eq(waitlistSignups.normalizedEmail, normalizedEmail),
          eq(waitlistSignups.userId, canonical.userId)
        )
      )
      .for("update");
    let signup = rows.find((row) => row.normalizedEmail === normalizedEmail);
    if (
      rows.some(
        (row) =>
          row.userId === canonical.userId &&
          row.normalizedEmail !== normalizedEmail
      ) ||
      (signup?.userId && signup.userId !== canonical.userId)
    ) {
      console.warn("waitlist_identity_link_conflict", {
        userId: canonical.userId,
      });
      return { enrolled: false, reason: "waitlist_conflict" };
    }
    if (signup && ["suppressed", "unsubscribed"].includes(signup.status))
      return { enrolled: false, reason: "inactive_contact" };
    const now = new Date();
    if (!signup) {
      const [referrer] = context?.referralCode
        ? await tx
            .select({
              id: waitlistSignups.id,
              normalizedEmail: waitlistSignups.normalizedEmail,
            })
            .from(waitlistSignups)
            .where(
              and(
                eq(waitlistSignups.referralCode, context.referralCode),
                eq(waitlistSignups.status, "confirmed")
              )
            )
            .limit(1)
        : [];
      const touch = context?.attribution ?? {};
      [signup] = await tx
        .insert(waitlistSignups)
        .values({
          email: identity.email!.trim(),
          normalizedEmail,
          userId: canonical.userId,
          enrollmentSource: context?.source ?? "console_auth",
          referredBy:
            referrer && referrer.normalizedEmail !== normalizedEmail
              ? referrer.id
              : null,
          referralCode: randomReferralCode(),
          status: "confirmed",
          confirmedAt: now,
          firstTouch: touch,
          lastTouch: touch,
          marketingConsent: false,
        })
        .returning();
    } else {
      [signup] = await tx
        .update(waitlistSignups)
        .set({
          userId: canonical.userId,
          ...(signup.status === "pending"
            ? { status: "confirmed" as const, confirmedAt: now }
            : {}),
          lastSeenAt: now,
        })
        .where(eq(waitlistSignups.id, signup.id))
        .returning();
    }
    if (signup.referredBy && signup.referredBy !== signup.id)
      await tx
        .insert(pointEvents)
        .values({
          signupId: signup.referredBy,
          referralSignupId: signup.id,
          reason: "verified_referral",
          points: 1,
        })
        .onConflictDoNothing();
    // Bind contact ownership without changing the authoritative consent state.
    await tx
      .update(emailSubscriptions)
      .set({ userId: canonical.userId })
      .where(
        and(
          eq(emailSubscriptions.normalizedEmail, normalizedEmail),
          eq(emailSubscriptions.signupId, signup.id)
        )
      );
    const grants = await tx
      .select()
      .from(accessGrants)
      .where(
        or(
          eq(accessGrants.signupId, signup.id),
          eq(accessGrants.userId, canonical.userId)
        )
      )
      .for("update");
    const grant = grants.find((row) => row.signupId === signup.id);
    const userGrant = grants.find((row) => row.userId === canonical.userId);
    if (!grant && userGrant && !userGrant.signupId) {
      const version = userGrant.version + 1;
      await tx
        .update(accessGrants)
        .set({ signupId: signup.id, activatedAt: now, updatedAt: now, version })
        .where(eq(accessGrants.id, userGrant.id));
      await tx.insert(accessEvents).values({
        grantId: userGrant.id,
        action: "activate",
        source: "trusted_waitlist_link",
        previousStatus: userGrant.status,
        nextStatus: userGrant.status,
        grantVersion: version,
      });
    }
    if (
      grant &&
      !grant.userId &&
      !grants.some((row) => row.userId === canonical.userId)
    ) {
      const version = grant.version + 1;
      await tx
        .update(accessGrants)
        .set({
          userId: canonical.userId,
          activatedAt: now,
          updatedAt: now,
          version,
        })
        .where(eq(accessGrants.id, grant.id));
      await tx.insert(accessEvents).values({
        grantId: grant.id,
        action: "activate",
        source: "trusted_waitlist_link",
        previousStatus: grant.status,
        nextStatus: grant.status,
        grantVersion: version,
      });
    } else if (grant && grant.userId !== canonical.userId) {
      console.warn("access_grant_link_conflict", {
        userId: canonical.userId,
        grantId: grant.id,
      });
      return { enrolled: true, signupId: signup.id, reason: "grant_conflict" };
    }
    return { enrolled: true, signupId: signup.id };
  });
}
