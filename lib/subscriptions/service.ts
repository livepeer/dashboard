import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  consentEvents,
  emailOutbox,
  emailSubscriptions,
  waitlistSignups,
} from "@/lib/db/schema";
import { newsletterConsentOutboxValues } from "@/lib/email/outbox";
import { NEWSLETTER_CONSENT_VERSION } from "@/lib/waitlist/contracts";
import { NEWSLETTER_PURPOSE, newsletterLockKey } from "./locking";

type Transaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];
export { NEWSLETTER_PURPOSE } from "./locking";

export async function getNewsletterConsent(normalizedEmail: string) {
  const [row] = await getDb()
    .select({ status: emailSubscriptions.status })
    .from(emailSubscriptions)
    .where(
      and(
        eq(emailSubscriptions.normalizedEmail, normalizedEmail),
        eq(emailSubscriptions.purpose, NEWSLETTER_PURPOSE)
      )
    )
    .limit(1);
  return row?.status === "subscribed";
}

/** Caller holds the signup row lock. State, evidence, projection and delivery commit together. */
export async function changeNewsletterConsentInTransaction(
  tx: Transaction,
  input: {
    signup: typeof waitlistSignups.$inferSelect;
    subscribed: boolean;
    source: string;
  }
) {
  const { signup, subscribed, source } = input;
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${newsletterLockKey(signup.normalizedEmail)}, 0))`
  );
  const [existing] = await tx
    .select()
    .from(emailSubscriptions)
    .where(
      and(
        eq(emailSubscriptions.normalizedEmail, signup.normalizedEmail),
        eq(emailSubscriptions.purpose, NEWSLETTER_PURPOSE)
      )
    )
    .limit(1);
  const status = subscribed
    ? ("subscribed" as const)
    : ("unsubscribed" as const);
  const [subscription] = await tx
    .insert(emailSubscriptions)
    .values({
      normalizedEmail: signup.normalizedEmail,
      purpose: NEWSLETTER_PURPOSE,
      status,
      source,
      signupId: signup.id,
      userId: signup.userId,
    })
    .onConflictDoUpdate({
      target: [emailSubscriptions.normalizedEmail, emailSubscriptions.purpose],
      set: {
        status,
        source,
        updatedAt: new Date(),
        signupId: signup.id,
        userId: signup.userId,
      },
    })
    .returning();
  await tx
    .update(waitlistSignups)
    .set({ marketingConsent: subscribed })
    .where(eq(waitlistSignups.id, signup.id));
  if (existing?.status === status) return null;
  const [event] = await tx
    .insert(consentEvents)
    .values({
      subscriptionId: subscription.id,
      signupId: signup.id,
      purpose: NEWSLETTER_PURPOSE,
      granted: subscribed,
      disclosureVersion: NEWSLETTER_CONSENT_VERSION,
      source,
    })
    .returning();
  const [outbox] = await tx
    .insert(emailOutbox)
    .values(
      newsletterConsentOutboxValues({
        signupId: signup.id,
        consentEventId: event.id,
        email: signup.email,
        subscribed,
      })
    )
    .onConflictDoNothing()
    .returning({ id: emailOutbox.id });
  return outbox?.id ?? null;
}

export async function changeNewsletterConsent(
  signupId: string,
  subscribed: boolean,
  source: string
) {
  return getDb().transaction(async (tx) => {
    const [signup] = await tx
      .select()
      .from(waitlistSignups)
      .where(eq(waitlistSignups.id, signupId))
      .for("update")
      .limit(1);
    if (!signup || signup.status !== "confirmed")
      throw new Error("subscription_contact_unavailable");
    return changeNewsletterConsentInTransaction(tx, {
      signup,
      subscribed,
      source,
    });
  });
}
