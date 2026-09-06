import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { EmailProviderError } from "@/lib/email/provider";
import { openIntegrationDatabase } from "@/tests/support/isolated-db";

const mocks = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  send: vi.fn(),
  audience: vi.fn(),
  identity: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/authentication/session", () => ({
  getAuthenticatedIdentity: mocks.identity,
}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    NEXT_PUBLIC_SITE_URL: "https://preview.example.invalid",
    ATTRIBUTION_HASH_SECRET: "integration-attribution-secret-not-production",
    INTERNAL_OUTBOX_SECRET: "integration-outbox-secret-not-production",
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookies.has(name) ? { value: mocks.cookies.get(name) } : undefined,
    set: (name: string, value: string) => mocks.cookies.set(name, value),
    delete: (name: string) => mocks.cookies.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/analytics-server", () => ({ captureEmailVerified: vi.fn() }));
vi.mock("@/lib/email/resend", () => ({
  getEmailProviderFromEnv: () => ({ sendVerificationEmail: mocks.send }),
}));
vi.mock("@/lib/email/resend-audience", () => ({
  getAudienceProviderFromEnv: () => ({ updateContact: mocks.audience }),
}));

import { getDb } from "@/lib/db";
import { resolveProviderIdentity } from "@/lib/identity/provider-user";
import { hashIdentifier, SESSION_COOKIE } from "./security";
import { POST as signup } from "@/app/api/waitlist/route";
import { GET as verify } from "@/app/verify/route";
import { GET as session } from "@/app/api/session/route";
import { POST as logout } from "@/app/api/logout/route";
import { PUT as consent } from "@/app/api/newsletter-consent/route";
import { GET as csv } from "@/app/api/admin/signups.csv/route";
import { POST as outbox } from "@/app/api/internal/outbox/route";

const databaseUrl = process.env.TEST_DATABASE_URL;
const prefix = `route-test-${randomUUID()}`;
const addresses = new Set<string>();
const userIds: string[] = [];
let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof getDb>;
function address(name: string) {
  const value = `${prefix}-${name}@example.invalid`;
  addresses.add(value);
  return value;
}
function request(path: string, body?: object, method = "POST") {
  return new Request(`https://preview.example.invalid${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "https://preview.example.invalid",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const workerRequest = () =>
  new Request("https://preview.example.invalid/api/internal/outbox", {
    method: "POST",
    headers: {
      authorization: "Bearer integration-outbox-secret-not-production",
    },
  });
async function record(email: string) {
  return (
    await db
      .select()
      .from(schema.waitlistSignups)
      .where(eq(schema.waitlistSignups.normalizedEmail, email))
  )[0];
}
async function verifyLastEmail() {
  const url = mocks.send.mock.calls.at(-1)![0].verificationUrl;
  await expect(verify(new Request(url))).rejects.toThrow("redirect:/waitlist");
  return url as string;
}

describe.skipIf(!databaseUrl)(
  "waitlist route parity against isolated Postgres",
  () => {
    beforeAll(async () => {
      const isolated = await openIntegrationDatabase(process.env);
      client = isolated.client;
      db = drizzle(client, { schema });
      vi.mocked(getDb).mockImplementation(() => db);
      // The worker scans pending events. Processed/terminal synthetic records
      // from other suites are inert and need not be deleted with their audits.
      const existing = await db
        .select({ id: schema.emailOutbox.id })
        .from(schema.emailOutbox)
        .where(
          and(
            isNull(schema.emailOutbox.processedAt),
            isNull(schema.emailOutbox.terminalAt)
          )
        )
        .limit(1);
      if (existing.length)
        throw new Error(
          "Route tests require no outstanding isolated outbox events"
        );
    });

    beforeEach(() => {
      mocks.cookies.clear();
      mocks.identity.mockReset().mockResolvedValue(null);
      mocks.send
        .mockReset()
        .mockResolvedValue({ providerMessageId: "test-delivery" });
      mocks.audience.mockReset().mockResolvedValue(undefined);
    });

    afterEach(async () => {
      if (!db) return;
      const rows = await db
        .select({ id: schema.waitlistSignups.id })
        .from(schema.waitlistSignups)
        .where(like(schema.waitlistSignups.normalizedEmail, `${prefix}%`));
      if (rows.length) {
        await db.delete(schema.adminRoleGrants).where(
          inArray(
            schema.adminRoleGrants.signupId,
            rows.map((r) => r.id)
          )
        );
        await db.delete(schema.consentEvents).where(
          inArray(
            schema.consentEvents.signupId,
            rows.map((r) => r.id)
          )
        );
        await db.delete(schema.emailSubscriptions).where(
          inArray(
            schema.emailSubscriptions.signupId,
            rows.map((r) => r.id)
          )
        );
        await db.delete(schema.emailOutbox).where(
          inArray(
            schema.emailOutbox.signupId,
            rows.map((r) => r.id)
          )
        );
        await db.delete(schema.waitlistSignups).where(
          inArray(
            schema.waitlistSignups.id,
            rows.map((r) => r.id)
          )
        );
      }
      if (addresses.size)
        await db.delete(schema.rateLimits).where(
          inArray(
            schema.rateLimits.keyHash,
            [...addresses].map(
              (email) => hashIdentifier(`signup-email:${email}`)!
            )
          )
        );
      addresses.clear();
      if (userIds.length)
        await db
          .delete(schema.users)
          .where(inArray(schema.users.id, userIds.splice(0)));
    });
    afterAll(async () => {
      await client?.end();
    });

    it("handles signup, verification, referrals, consent, admin CSV and logout", async () => {
      const referrerEmail = address("referrer");
      expect(
        (await signup(request("/api/waitlist", { email: referrerEmail })))
          .status
      ).toBe(202);
      await verifyLastEmail();
      const referrer = await record(referrerEmail);
      mocks.cookies.clear();

      const memberEmail = address("member");
      const response = await signup(
        request("/api/waitlist", {
          email: memberEmail,
          referralCode: referrer.referralCode,
          newsletterOptIn: true,
          attribution: {
            utm_source: "integration",
            ref: referrer.referralCode,
          },
        })
      );
      expect(response.status).toBe(202);
      const pending = await record(memberEmail);
      expect(pending.status).toBe("pending");
      expect(pending.userId).toBeNull();
      expect(pending.marketingConsent).toBe(false);
      expect(pending.firstTouch.utm_source).toBe("integration");
      expect(pending.referredBy).toBe(referrer.id);
      const verificationUrl = await verifyLastEmail();
      expect(mocks.cookies.get(SESSION_COOKIE)).toBeTruthy();
      const confirmed = await record(memberEmail);
      expect(confirmed.status).toBe("confirmed");
      expect(confirmed.marketingConsent).toBe(true);
      expect(confirmed.userId).toBeNull();
      const member = await (await session()).json();
      expect(member.member.email).toBe(memberEmail);
      expect(member.member.referralUrl).toContain("/waitlist?ref=");
      const points = await db
        .select()
        .from(schema.pointEvents)
        .where(eq(schema.pointEvents.referralSignupId, confirmed.id));
      expect(points).toHaveLength(1);
      expect(points[0].signupId).toBe(referrer.id);
      await expect(verify(new Request(verificationUrl))).rejects.toThrow(
        "redirect:/waitlist?verification=invalid"
      );

      expect((await csv()).status).toBe(404);
      await db
        .insert(schema.adminRoleGrants)
        .values({ signupId: confirmed.id, source: "synthetic_fixture" });
      // Even an administrator's valid waitlist cookie cannot authorize Console.
      expect((await csv()).status).toBe(404);
      const identity = {
        authority: "auth0",
        issuer: "https://auth.example.invalid",
        subject: `${prefix}-admin`,
        email: memberEmail,
        emailVerified: true,
      };
      userIds.push((await resolveProviderIdentity(identity)).userId);
      mocks.identity.mockResolvedValue(identity);
      const exported = await csv();
      expect(exported.status).toBe(200);
      expect(exported.headers.get("cache-control")).toBe("private, no-store");
      expect(await exported.text()).toContain(memberEmail);

      const dispatched = await outbox(workerRequest());
      expect(dispatched.status).toBe(200);
      expect(mocks.audience).toHaveBeenCalledWith(
        expect.objectContaining({ email: memberEmail, subscribed: true })
      );
      expect(
        (
          await consent(
            request(
              "/api/newsletter-consent",
              { newsletterOptIn: false },
              "PUT"
            )
          )
        ).status
      ).toBe(200);
      expect((await record(memberEmail)).marketingConsent).toBe(false);
      expect(mocks.audience).toHaveBeenLastCalledWith(
        expect.objectContaining({ email: memberEmail, subscribed: false })
      );
      const changes = await db
        .select()
        .from(schema.consentEvents)
        .where(eq(schema.consentEvents.signupId, confirmed.id));
      expect(changes.map((r) => r.granted).sort()).toEqual([false, true]);

      expect(
        (
          await logout(
            new Request("https://preview.example.invalid/api/logout", {
              method: "POST",
              headers: { origin: "https://other.invalid" },
            })
          )
        ).status
      ).toBe(403);
      expect((await session()).status).toBe(200);
      expect((await logout(request("/api/logout"))).status).toBe(200);
      expect((await session()).status).toBe(401);
      // Waitlist logout leaves the independent Auth0 Console session intact.
      expect((await csv()).status).toBe(200);
      mocks.identity.mockResolvedValue(null);
      expect((await csv()).status).toBe(404);
      expect(
        (
          await consent(
            request("/api/newsletter-consent", { newsletterOptIn: true }, "PUT")
          )
        ).status
      ).toBe(401);
    }, 60000);

    it("persists failed delivery, protects the worker, and retries with the same idempotency key", async () => {
      mocks.send.mockRejectedValueOnce(
        new EmailProviderError(
          "temporary test failure",
          true,
          "test_unavailable"
        )
      );
      const email = address("retry");
      expect((await signup(request("/api/waitlist", { email }))).status).toBe(
        202
      );
      const saved = await record(email);
      const [event] = await db
        .select()
        .from(schema.emailOutbox)
        .where(eq(schema.emailOutbox.signupId, saved.id));
      expect(event.processedAt).toBeNull();
      expect(event.attemptCount).toBe(1);
      expect(event.lastErrorCode).toBe("test_unavailable");
      expect((await outbox(request("/api/internal/outbox"))).status).toBe(401);
      await db
        .update(schema.emailOutbox)
        .set({ nextAttemptAt: new Date(0) })
        .where(eq(schema.emailOutbox.id, event.id));
      expect((await (await outbox(workerRequest())).json()).delivered).toBe(1);
      expect(mocks.send.mock.calls[0][0].idempotencyKey).toBe(
        mocks.send.mock.calls[1][0].idempotencyKey
      );
      const [delivered] = await db
        .select()
        .from(schema.emailOutbox)
        .where(eq(schema.emailOutbox.id, event.id));
      expect(delivered.processedAt).toBeInstanceOf(Date);
      expect(delivered.payload).toEqual({});
      expect(delivered.attemptCount).toBe(2);
    }, 30000);

    it("rate limits requests and does not create contacts through auth-only login", async () => {
      const email = address("rate-limit");
      for (let i = 0; i < 5; i++) {
        expect(
          (await signup(request("/api/waitlist", { email, authOnly: true })))
            .status
        ).toBe(202);
      }
      expect(await record(email)).toBeUndefined();
      expect(mocks.send).not.toHaveBeenCalled();
      expect(
        (await signup(request("/api/waitlist", { email, authOnly: true })))
          .status
      ).toBe(429);
      expect(
        (await signup(request("/api/waitlist", { email: "invalid" }))).status
      ).toBe(400);
    }, 30000);
  }
);
