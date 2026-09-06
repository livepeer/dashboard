import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailSubscriptions } from "@/lib/db/schema";
import {
  AudienceProviderError,
  type AudienceProvider,
} from "@/lib/email/audience-provider";
import { NEWSLETTER_PURPOSE, newsletterLockKey } from "./locking";

export const NEWSLETTER_DELIVERY_TIMEOUT_MS = 3000;
export type NewsletterSynchronizer = (input: {
  email: string;
  provider: AudienceProvider;
}) => Promise<void>;

/** The lock is shared with consent writers and held until bounded delivery settles.
 * A historical event is a reconciliation trigger, never authority to replay opt-in.
 */
export const synchronizeNewsletterConsent: NewsletterSynchronizer = async ({
  email,
  provider,
}) => {
  const normalizedEmail = email.trim().toLowerCase();
  await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${newsletterLockKey(normalizedEmail)}, 0))`
    );
    const [current] = await tx
      .select()
      .from(emailSubscriptions)
      .where(
        and(
          eq(emailSubscriptions.normalizedEmail, normalizedEmail),
          eq(emailSubscriptions.purpose, NEWSLETTER_PURPOSE)
        )
      )
      .limit(1);
    const subscribed = current?.status === "subscribed";
    // Provider idempotency is bound to the current state, not the stale trigger.
    const idempotencyKey = current
      ? `newsletter-state:${current.id}:${current.updatedAt.getTime()}:${subscribed}`
      : `newsletter-unsubscribed:${normalizedEmail}`;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new AudienceProviderError(
              "Audience synchronization timed out",
              true,
              "delivery_timeout"
            )
          );
        }, NEWSLETTER_DELIVERY_TIMEOUT_MS);
      });
      await Promise.race([
        provider.updateContact({
          email: normalizedEmail,
          subscribed,
          idempotencyKey,
          signal: controller.signal,
        }),
        timeout,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  });
};
