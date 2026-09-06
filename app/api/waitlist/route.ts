import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import {
  attributionTouches,
  emailOutbox,
  rateLimits,
  verificationTokens,
  waitlistSignups,
} from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { getNewsletterConsent } from "@/lib/subscriptions/service";
import {
  dispatchOutboxEvent,
  VERIFICATION_EMAIL_EVENT,
} from "@/lib/email/outbox";
import {
  hashIdentifier,
  hashToken,
  normalizeEmail,
  randomReferralCode,
  randomToken,
  VERIFICATION_TTL_MS,
} from "@/lib/waitlist/security";

export const runtime = "nodejs";

const GENERIC_MESSAGE =
  "If that address can join, a verification link is on its way.";
const signupSchema = z.object({
  authOnly: z.boolean().default(false),
  email: z.string().trim().email().max(320),
  newsletterOptIn: z.boolean().default(false),
  referralCode: z.string().trim().max(64).optional(),
  company: z.string().max(0).optional(),
  attribution: z.record(z.string(), z.string().max(500)).default({}),
});

function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")
  );
}

async function withinRateLimit(
  keyHash: string | null,
  maximumAttempts: number
) {
  if (!keyHash) return true;
  const db = getDb();
  const bucket = new Date(Math.floor(Date.now() / 900_000) * 900_000);
  const [row] = await db
    .insert(rateLimits)
    .values({ keyHash, bucket, attempts: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.keyHash, rateLimits.bucket],
      set: { attempts: sql`${rateLimits.attempts} + 1` },
    })
    .returning({ attempts: rateLimits.attempts });
  return row.attempts <= maximumAttempts;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 10_000) {
    return Response.json({ message: "Request is too large." }, { status: 413 });
  }

  let parsed: z.infer<typeof signupSchema>;
  try {
    parsed = signupSchema.parse(await request.json());
  } catch {
    return Response.json(
      { message: "Enter a valid email address." },
      { status: 400 }
    );
  }

  if (parsed.company) return Response.json({ message: GENERIC_MESSAGE });

  const normalizedEmail = normalizeEmail(parsed.email);
  const ipHash = hashIdentifier(
    clientIp(request) ? `signup-ip:${clientIp(request)}` : null
  );
  const emailHash = hashIdentifier(`signup-email:${normalizedEmail}`);
  let ipAllowed: boolean;
  let emailAllowed: boolean;
  try {
    const rateLimitResult = await Promise.all([
      withinRateLimit(ipHash, 10),
      withinRateLimit(emailHash, 5),
    ]);
    ipAllowed = rateLimitResult[0];
    emailAllowed = rateLimitResult[1];
  } catch (error) {
    console.error("waitlist_rate_limit_check_failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return Response.json(
      {
        message: "We could not process that request. Please try again shortly.",
      },
      { status: 503 }
    );
  }
  if (!ipAllowed || !emailAllowed) {
    return Response.json(
      { message: "Please try again later." },
      { status: 429 }
    );
  }

  try {
    const db = getDb();
    const env = getEnv();
    const rawToken = randomToken();
    const existingConsent = parsed.authOnly
      ? await getNewsletterConsent(normalizedEmail)
      : false;
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
    const touch = {
      ...parsed.attribution,
      captured_at: new Date().toISOString(),
    };

    const outboxEventId = await db.transaction(async (tx) => {
      let created = false;
      let signup: { id: string; marketingConsent: boolean } | undefined;

      if (parsed.authOnly) {
        const [existing] = await tx
          .select({
            id: waitlistSignups.id,
            marketingConsent: waitlistSignups.marketingConsent,
          })
          .from(waitlistSignups)
          .where(
            and(
              eq(waitlistSignups.normalizedEmail, normalizedEmail),
              eq(waitlistSignups.status, "confirmed")
            )
          )
          .for("update")
          .limit(1);

        signup = existing;
        if (!signup) return null;
      } else {
        const [referrer] = parsed.referralCode
          ? await tx
              .select({
                id: waitlistSignups.id,
                normalizedEmail: waitlistSignups.normalizedEmail,
              })
              .from(waitlistSignups)
              .where(
                and(
                  eq(waitlistSignups.referralCode, parsed.referralCode),
                  eq(waitlistSignups.status, "confirmed")
                )
              )
              .limit(1)
          : [];

        const [inserted] = await tx
          .insert(waitlistSignups)
          .values({
            email: parsed.email.trim(),
            normalizedEmail,
            referralCode: randomReferralCode(),
            referredBy:
              referrer?.normalizedEmail === normalizedEmail
                ? null
                : referrer?.id,
            firstTouch: touch,
            lastTouch: touch,
            ipHash,
            userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
          })
          .onConflictDoNothing({ target: waitlistSignups.normalizedEmail })
          .returning({
            id: waitlistSignups.id,
            marketingConsent: waitlistSignups.marketingConsent,
          });

        created = Boolean(inserted);
        signup = inserted
          ? inserted
          : (
              await tx
                .select({
                  id: waitlistSignups.id,
                  marketingConsent: waitlistSignups.marketingConsent,
                })
                .from(waitlistSignups)
                .where(eq(waitlistSignups.normalizedEmail, normalizedEmail))
                .for("update")
                .limit(1)
            )[0];
      }

      if (!signup) throw new Error("signup_not_found");

      await tx
        .insert(attributionTouches)
        .values({ signupId: signup.id, data: touch });
      if (!created) {
        await tx
          .update(waitlistSignups)
          .set({
            lastTouch: touch,
            lastSeenAt: new Date(),
          })
          .where(eq(waitlistSignups.id, signup.id));
      }

      await tx
        .update(verificationTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(verificationTokens.signupId, signup.id),
            isNull(verificationTokens.consumedAt)
          )
        );

      await tx.insert(verificationTokens).values({
        signupId: signup.id,
        tokenHash: hashToken(rawToken),
        requestedMarketingConsent: parsed.authOnly
          ? existingConsent
          : parsed.newsletterOptIn,
        expiresAt,
      });
      const [outboxEvent] = await tx
        .insert(emailOutbox)
        .values({
          signupId: signup.id,
          eventType: VERIFICATION_EMAIL_EVENT,
          payload: {
            to: parsed.email.trim(),
            verificationUrl: `${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/verify?token=${rawToken}`,
            expiresAt: expiresAt.toISOString(),
          },
          idempotencyKey: `verify:${hashToken(rawToken)}`,
        })
        .returning({ id: emailOutbox.id });

      return outboxEvent.id;
    });

    try {
      if (!outboxEventId) {
        return Response.json({ message: GENERIC_MESSAGE }, { status: 202 });
      }
      await dispatchOutboxEvent(outboxEventId);
    } catch (error) {
      console.error("verification_email_immediate_dispatch_failed", {
        errorType: error instanceof Error ? error.name : "unknown",
      });
    }

    return Response.json({ message: GENERIC_MESSAGE }, { status: 202 });
  } catch (error) {
    console.error("waitlist_signup_failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return Response.json(
      {
        message: "We could not process that request. Please try again shortly.",
      },
      { status: 503 }
    );
  }
}
