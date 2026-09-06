import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  adminRoleGrants,
  pointEvents,
  sessions,
  waitlistSignups,
} from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { getNewsletterConsent } from "@/lib/subscriptions/service";
import type {
  WaitlistLeaderboardEntry,
  WaitlistMember,
} from "@/lib/waitlist/contracts";
import {
  analyticsMemberId,
  hashToken,
  maskEmail,
} from "@/lib/waitlist/security";

export async function getSignupForSession(rawToken?: string) {
  if (!rawToken) return null;
  const db = getDb();
  const [row] = await db
    .select({ signup: waitlistSignups, sessionId: sessions.id })
    .from(sessions)
    .innerJoin(waitlistSignups, eq(sessions.signupId, waitlistSignups.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(rawToken)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        eq(waitlistSignups.status, "confirmed")
      )
    )
    .limit(1);
  return row ?? null;
}

export async function getLeaderboard(
  limit = 100
): Promise<WaitlistLeaderboardEntry[]> {
  const db = getDb();
  const points = sql<number>`coalesce(sum(${pointEvents.points}), 0)::int`;
  const rows = await db
    .select({ email: waitlistSignups.email, points })
    .from(waitlistSignups)
    .leftJoin(pointEvents, eq(pointEvents.signupId, waitlistSignups.id))
    .where(eq(waitlistSignups.status, "confirmed"))
    .groupBy(waitlistSignups.id)
    .orderBy(
      desc(points),
      asc(waitlistSignups.confirmedAt),
      asc(waitlistSignups.id)
    )
    .limit(limit);
  return rows.map((row) => ({
    displayName: maskEmail(row.email),
    points: row.points,
  }));
}

export async function getMember(
  signup: typeof waitlistSignups.$inferSelect
): Promise<WaitlistMember> {
  if (!signup.confirmedAt) {
    throw new Error("Confirmed signup is missing confirmedAt");
  }

  const db = getDb();
  const [[position], [referrals], [points]] = await Promise.all([
    db
      .select({ value: count() })
      .from(waitlistSignups)
      .where(
        and(
          eq(waitlistSignups.status, "confirmed"),
          or(
            lt(waitlistSignups.confirmedAt, signup.confirmedAt),
            and(
              eq(waitlistSignups.confirmedAt, signup.confirmedAt),
              lte(waitlistSignups.id, signup.id)
            )
          )
        )
      ),
    db
      .select({
        pending: sql<number>`count(*) filter (where ${waitlistSignups.status} = 'pending')::int`,
        verified: sql<number>`count(*) filter (where ${waitlistSignups.status} = 'confirmed')::int`,
      })
      .from(waitlistSignups)
      .where(eq(waitlistSignups.referredBy, signup.id)),
    db
      .select({
        value: sql<number>`coalesce(sum(${pointEvents.points}), 0)::int`,
      })
      .from(pointEvents)
      .where(eq(pointEvents.signupId, signup.id)),
  ]);
  const baseUrl = getEnv().NEXT_PUBLIC_SITE_URL;
  const [adminGrant] = await db
    .select({ id: adminRoleGrants.id })
    .from(adminRoleGrants)
    .where(
      and(
        eq(adminRoleGrants.signupId, signup.id),
        isNull(adminRoleGrants.revokedAt)
      )
    )
    .limit(1);
  return {
    accountRole: adminGrant ? "admin" : "member",
    analyticsId: analyticsMemberId(signup.id),
    displayName: maskEmail(signup.email),
    email: signup.email,
    newsletterOptIn: await getNewsletterConsent(signup.normalizedEmail),
    points: points.value,
    position: position.value,
    referralCode: signup.referralCode,
    referralUrl: `${baseUrl.replace(/\/$/, "")}/waitlist?ref=${signup.referralCode}`,
    referrals: referrals ?? { pending: 0, verified: 0 },
  };
}
