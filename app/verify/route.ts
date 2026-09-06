import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { captureEmailVerified } from "@/lib/analytics-server";
import { getDb } from "@/lib/db";
import {
  pointEvents,
  sessions,
  verificationTokens,
  waitlistSignups,
} from "@/lib/db/schema";
import { changeNewsletterConsentInTransaction } from "@/lib/subscriptions/service";
import {
  analyticsMemberId,
  hashToken,
  randomToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  SESSION_TTL_MS,
} from "@/lib/waitlist/security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) redirect("/waitlist?verification=invalid");

  const db = getDb();
  const now = new Date();
  const rawSessionToken = randomToken();
  const sessionExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const result = await db.transaction(async (tx) => {
    const [verification] = await tx
      .select({
        id: verificationTokens.id,
        signupId: verificationTokens.signupId,
        requestedMarketingConsent: verificationTokens.requestedMarketingConsent,
      })
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.tokenHash, hashToken(token)),
          isNull(verificationTokens.consumedAt),
          gt(verificationTokens.expiresAt, now)
        )
      )
      .limit(1);
    if (!verification) return null;

    const [signup] = await tx
      .select()
      .from(waitlistSignups)
      .where(eq(waitlistSignups.id, verification.signupId))
      .for("update")
      .limit(1);
    if (!signup || !["pending", "confirmed"].includes(signup.status))
      return null;
    // Signup-first lock order matches token issuance and preference mutations.
    const [validToken] = await tx
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.id, verification.id),
          isNull(verificationTokens.consumedAt),
          gt(verificationTokens.expiresAt, now)
        )
      )
      .for("update")
      .limit(1);
    if (!validToken) return null;

    await tx
      .update(verificationTokens)
      .set({ consumedAt: now })
      .where(eq(verificationTokens.id, verification.id));
    await tx
      .update(waitlistSignups)
      .set({
        status: "confirmed",
        confirmedAt: now,
      })
      .where(
        and(
          eq(waitlistSignups.id, signup.id),
          eq(waitlistSignups.status, "pending")
        )
      );
    // A sign-in link must not restore stale consent captured before a preference change.
    if (signup.status === "pending")
      await changeNewsletterConsentInTransaction(tx, {
        signup,
        subscribed: verification.requestedMarketingConsent,
        source: "email_verification",
      });

    if (signup.referredBy && signup.referredBy !== signup.id) {
      await tx
        .insert(pointEvents)
        .values({
          id: randomUUID(),
          signupId: signup.referredBy,
          points: 1,
          reason: "verified_referral",
          referralSignupId: signup.id,
        })
        .onConflictDoNothing({
          target: [pointEvents.reason, pointEvents.referralSignupId],
        });
    }

    await tx.insert(sessions).values({
      signupId: signup.id,
      tokenHash: hashToken(rawSessionToken),
      expiresAt: sessionExpiresAt,
    });
    return {
      analyticsId: analyticsMemberId(signup.id),
      verificationId: verification.id,
    };
  });

  if (!result) redirect("/waitlist?verification=invalid");
  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE,
    rawSessionToken,
    sessionCookieOptions(sessionExpiresAt)
  );
  after(async () => {
    try {
      await captureEmailVerified(result);
    } catch (error) {
      console.error("waitlist_verification_analytics_failed", {
        errorType: error instanceof Error ? error.name : "unknown",
      });
    }
  });
  redirect("/waitlist");
}
