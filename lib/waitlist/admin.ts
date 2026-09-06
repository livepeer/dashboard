import { desc, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { waitlistSignups } from "@/lib/db/schema";

export type AdminWaitlistRow = {
  confirmedAt: Date | null;
  email: string;
  firstSeenAt: Date;
  marketingConsent: boolean;
  pendingReferrals: number;
  points: number;
  referredByEmail: string | null;
  referralCode: string;
  status: string;
  verifiedReferrals: number;
};

export type AdminWaitlistSummary = {
  confirmedSignups: number;
  newsletterSubscribers: number;
  totalSignups: number;
  totalVerifiedReferrals: number;
};

export async function getAdminWaitlistSummary(): Promise<AdminWaitlistSummary> {
  const [summary] = await getDb()
    .select({
      totalSignups: sql<number>`count(*)::int`,
      confirmedSignups: sql<number>`count(*) filter (
        where ${waitlistSignups.status} = 'confirmed'
      )::int`,
      totalVerifiedReferrals: sql<number>`count(*) filter (
        where ${waitlistSignups.referredBy} is not null
          and ${waitlistSignups.status} = 'confirmed'
      )::int`,
      newsletterSubscribers: sql<number>`count(*) filter (
        where exists (select 1 from email_subscriptions subscription where subscription.normalized_email = ${waitlistSignups.normalizedEmail} and subscription.purpose = 'product_marketing' and subscription.status = 'subscribed')
          and ${waitlistSignups.status} = 'confirmed'
      )::int`,
    })
    .from(waitlistSignups);

  return (
    summary ?? {
      totalSignups: 0,
      confirmedSignups: 0,
      newsletterSubscribers: 0,
      totalVerifiedReferrals: 0,
    }
  );
}

export async function getAdminWaitlistRows(
  limit = 1000
): Promise<AdminWaitlistRow[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), 5000);

  return getDb()
    .select({
      email: waitlistSignups.email,
      status: waitlistSignups.status,
      marketingConsent: sql<boolean>`exists (select 1 from email_subscriptions subscription where subscription.normalized_email = ${waitlistSignups.normalizedEmail} and subscription.purpose = 'product_marketing' and subscription.status = 'subscribed')`,
      referralCode: waitlistSignups.referralCode,
      firstSeenAt: waitlistSignups.firstSeenAt,
      confirmedAt: waitlistSignups.confirmedAt,
      referredByEmail: sql<string | null>`(
        select referrer.email
        from waitlist_signups referrer
        where referrer.id = ${waitlistSignups.referredBy}
      )`,
      points: sql<number>`(
        select coalesce(sum(event.points), 0)::int
        from point_events event
        where event.signup_id = ${waitlistSignups.id}
      )`,
      pendingReferrals: sql<number>`(
        select count(*)::int
        from waitlist_signups referral
        where referral.referred_by = ${waitlistSignups.id}
          and referral.status = 'pending'
      )`,
      verifiedReferrals: sql<number>`(
        select count(*)::int
        from waitlist_signups referral
        where referral.referred_by = ${waitlistSignups.id}
          and referral.status = 'confirmed'
      )`,
    })
    .from(waitlistSignups)
    .orderBy(desc(waitlistSignups.firstSeenAt), desc(waitlistSignups.id))
    .limit(boundedLimit);
}
