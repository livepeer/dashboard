import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";
import {
  AudienceProviderError,
  type AudienceProvider,
} from "@/lib/email/audience-provider";
import { EmailProviderError, type EmailProvider } from "@/lib/email/provider";
import { getAudienceProviderFromEnv } from "@/lib/email/resend-audience";
import { getEmailProviderFromEnv } from "@/lib/email/resend";
import { isCaptureDelivery } from "@/lib/email/delivery-mode";
import {
  synchronizeNewsletterConsent,
  type NewsletterSynchronizer,
} from "@/lib/subscriptions/delivery";

export const VERIFICATION_EMAIL_EVENT = "waitlist.verification_requested";
export const NEWSLETTER_CONSENT_EVENT = "newsletter.consent_changed";
export const APPROVAL_EMAIL_EVENT = "access.approved";
export const MAX_OUTBOX_ATTEMPTS = 8;
export const OUTBOX_LEASE_MS = 5 * 60_000;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;

const webUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  });

const verificationPayloadSchema = z.object({
  to: z.string().email(),
  verificationUrl: webUrlSchema,
  expiresAt: z.string().datetime(),
});

const newsletterPayloadSchema = z.object({
  email: z.string().email(),
  subscribed: z.boolean(),
  consentEventId: z.string().uuid(),
});
const approvalPayloadSchema = z.object({
  to: z.string().email(),
  loginUrl: webUrlSchema,
});

export function newsletterConsentOutboxValues(input: {
  signupId: string;
  consentEventId: string;
  email: string;
  subscribed: boolean;
}) {
  return {
    signupId: input.signupId,
    eventType: NEWSLETTER_CONSENT_EVENT,
    payload: {
      email: input.email,
      subscribed: input.subscribed,
      consentEventId: input.consentEventId,
    },
    idempotencyKey: `newsletter-consent:${input.consentEventId}`,
  };
}

export type OutboxEvent = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  attemptCount: number;
};

export interface OutboxStore {
  claimDue(limit: number, now: Date): Promise<OutboxEvent[]>;
  claimById(id: string, now: Date): Promise<OutboxEvent | null>;
  markProcessed(
    id: string,
    processedAt: Date,
    captured: boolean
  ): Promise<void>;
  markRetry(id: string, nextAttemptAt: Date, errorCode: string): Promise<void>;
  markTerminal(id: string, terminalAt: Date, errorCode: string): Promise<void>;
}

export type DispatchResult = {
  selected: number;
  delivered: number;
  failed: number;
  invalid: number;
  terminal: number;
};

export function createDrizzleOutboxStore(): OutboxStore {
  const db = getDb();

  async function claim(
    limit: number,
    now: Date,
    id?: string
  ): Promise<OutboxEvent[]> {
    const leaseExpiredAt = new Date(now.getTime() - OUTBOX_LEASE_MS);
    return db.transaction(async (tx) => {
      const conditions = [
        isNull(emailOutbox.processedAt),
        isNull(emailOutbox.terminalAt),
        or(
          isNull(emailOutbox.nextAttemptAt),
          lte(emailOutbox.nextAttemptAt, now)
        ),
        or(
          isNull(emailOutbox.lockedAt),
          lt(emailOutbox.lockedAt, leaseExpiredAt)
        ),
      ];
      if (id) conditions.push(eq(emailOutbox.id, id));

      const rows = await tx
        .select({
          id: emailOutbox.id,
          eventType: emailOutbox.eventType,
          payload: emailOutbox.payload,
          idempotencyKey: emailOutbox.idempotencyKey,
          attemptCount: emailOutbox.attemptCount,
        })
        .from(emailOutbox)
        .where(and(...conditions))
        .orderBy(asc(emailOutbox.createdAt))
        .limit(limit)
        .for("update", { skipLocked: true });

      if (rows.length === 0) return [];
      const ids = rows.map((row) => row.id);
      await tx
        .update(emailOutbox)
        .set({
          lockedAt: now,
          attemptCount: sql`${emailOutbox.attemptCount} + 1`,
        })
        .where(inArray(emailOutbox.id, ids));

      return rows.map((row) => ({
        ...row,
        attemptCount: row.attemptCount + 1,
      }));
    });
  }

  return {
    claimDue: (limit, now) => claim(limit, now),
    async claimById(id, now) {
      return (await claim(1, now, id))[0] ?? null;
    },
    async markProcessed(id, processedAt, captured) {
      await db
        .update(emailOutbox)
        .set({
          processedAt,
          ...(captured ? {} : { payload: {} }),
          lockedAt: null,
          lastErrorCode: captured ? "captured" : null,
        })
        .where(and(eq(emailOutbox.id, id), isNull(emailOutbox.processedAt)));
    },
    async markRetry(id, nextAttemptAt, errorCode) {
      await db
        .update(emailOutbox)
        .set({ nextAttemptAt, lastErrorCode: errorCode, lockedAt: null })
        .where(
          and(
            eq(emailOutbox.id, id),
            isNull(emailOutbox.processedAt),
            isNull(emailOutbox.terminalAt)
          )
        );
    },
    async markTerminal(id, terminalAt, errorCode) {
      await db
        .update(emailOutbox)
        .set({
          terminalAt,
          payload: {},
          lastErrorCode: errorCode,
          lockedAt: null,
        })
        .where(
          and(
            eq(emailOutbox.id, id),
            isNull(emailOutbox.processedAt),
            isNull(emailOutbox.terminalAt)
          )
        );
    },
  };
}

function backoff(attemptCount: number) {
  return Math.min(
    BASE_BACKOFF_MS * 2 ** Math.max(0, attemptCount - 1),
    MAX_BACKOFF_MS
  );
}

type Providers = {
  email?: EmailProvider;
  audience?: AudienceProvider;
  newsletterSync?: NewsletterSynchronizer;
};

async function deliver(
  event: OutboxEvent,
  providers: Providers,
  store: OutboxStore,
  now: Date
): Promise<"delivered" | "failed" | "invalid" | "terminal"> {
  try {
    const captured = isCaptureDelivery(
      event.eventType === NEWSLETTER_CONSENT_EVENT ? "newsletter" : "email",
      typeof event.payload.to === "string" ? event.payload.to : undefined
    );
    if (event.eventType === VERIFICATION_EMAIL_EVENT) {
      const payload = verificationPayloadSchema.safeParse(event.payload);
      if (!payload.success) {
        await store.markTerminal(event.id, now, "invalid_payload");
        return "invalid";
      }
      const provider = captured
        ? undefined
        : (providers.email ?? getEmailProviderFromEnv());
      await provider?.sendVerificationEmail({
        ...payload.data,
        idempotencyKey: event.idempotencyKey,
      });
    } else if (event.eventType === NEWSLETTER_CONSENT_EVENT) {
      const payload = newsletterPayloadSchema.safeParse(event.payload);
      if (!payload.success) {
        await store.markTerminal(event.id, now, "invalid_payload");
        return "invalid";
      }
      const provider = captured
        ? undefined
        : (providers.audience ?? getAudienceProviderFromEnv());
      if (provider)
        await (providers.newsletterSync ?? synchronizeNewsletterConsent)({
          email: payload.data.email,
          provider,
        });
    } else if (event.eventType === APPROVAL_EMAIL_EVENT) {
      const payload = approvalPayloadSchema.safeParse(event.payload);
      if (!payload.success) {
        await store.markTerminal(event.id, now, "invalid_payload");
        return "invalid";
      }
      if (!captured) {
        const provider = providers.email ?? getEmailProviderFromEnv();
        if (!provider.sendApprovalEmail)
          throw new EmailProviderError(
            "Approval delivery unsupported",
            true,
            "approval_delivery_unsupported"
          );
        await provider.sendApprovalEmail({
          ...payload.data,
          idempotencyKey: event.idempotencyKey,
        });
      }
    } else {
      await store.markTerminal(event.id, now, "unsupported_event");
      return "invalid";
    }

    await store.markProcessed(event.id, now, captured);
    return "delivered";
  } catch (error) {
    const providerError =
      error instanceof EmailProviderError ||
      error instanceof AudienceProviderError
        ? error
        : null;
    const retryable = providerError?.retryable ?? true;
    const errorCode = providerError?.code ?? "unexpected_error";
    const exhausted = event.attemptCount >= MAX_OUTBOX_ATTEMPTS;

    console.error("email_outbox_delivery_failed", {
      eventId: event.id,
      eventType: event.eventType,
      retryable,
      attemptCount: event.attemptCount,
    });

    if (!retryable || exhausted) {
      await store.markTerminal(
        event.id,
        now,
        exhausted ? "attempts_exhausted" : errorCode
      );
      return "terminal";
    }

    await store.markRetry(
      event.id,
      new Date(now.getTime() + backoff(event.attemptCount)),
      errorCode
    );
    return "failed";
  }
}

export async function dispatchPendingOutbox(options?: {
  limit?: number;
  emailProvider?: EmailProvider;
  audienceProvider?: AudienceProvider;
  newsletterSync?: NewsletterSynchronizer;
  store?: OutboxStore;
  now?: Date;
}): Promise<DispatchResult> {
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);
  const store = options?.store ?? createDrizzleOutboxStore();
  const now = options?.now ?? new Date();
  const events = await store.claimDue(limit, now);
  const result: DispatchResult = {
    selected: events.length,
    delivered: 0,
    failed: 0,
    invalid: 0,
    terminal: 0,
  };

  for (const event of events) {
    result[
      await deliver(
        event,
        {
          email: options?.emailProvider,
          audience: options?.audienceProvider,
          newsletterSync: options?.newsletterSync,
        },
        store,
        now
      )
    ] += 1;
  }

  return result;
}

export async function dispatchOutboxEvent(
  eventId: string,
  options?: {
    emailProvider?: EmailProvider;
    audienceProvider?: AudienceProvider;
    newsletterSync?: NewsletterSynchronizer;
    store?: OutboxStore;
    now?: Date;
  }
) {
  const store = options?.store ?? createDrizzleOutboxStore();
  const now = options?.now ?? new Date();
  const event = await store.claimById(eventId, now);
  if (!event) return "not_pending" as const;
  return deliver(
    event,
    {
      email: options?.emailProvider,
      audience: options?.audienceProvider,
      newsletterSync: options?.newsletterSync,
    },
    store,
    now
  );
}
