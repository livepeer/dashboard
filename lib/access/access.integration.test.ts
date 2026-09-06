import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { openIntegrationDatabase } from "@/tests/support/isolated-db";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db";
import { enrollAuthenticatedUser } from "./enrollment";
import { getAccessDecision, requireApprovedExternalAccount } from "./service";
import {
  resolveProviderIdentity,
  linkProviderIdentityToUser,
} from "@/lib/identity/provider-user";
import { resolveExternalAccount } from "@/lib/external-accounts/service";
import {
  mutateAccessSelection,
  listAccessEntries,
  freezeAccessSelection,
  parseAccessFilters,
  exportAccessSelection,
} from "@/lib/admin/access";
import {
  changeNewsletterConsent,
  getNewsletterConsent,
} from "@/lib/subscriptions/service";
import { synchronizeNewsletterConsent } from "@/lib/subscriptions/delivery";
import { dispatchOutboxEvent } from "@/lib/email/outbox";
import type {
  AdminPrincipal,
  ProviderIdentity,
} from "@/lib/platform/contracts";
const prefix = `access-test-${randomUUID()}`;
const signupIds: string[] = [];
let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof getDb>;
let actor: AdminPrincipal;
const scope = {
  service: "pymthouse" as const,
  issuer: "https://issuer.example.invalid",
  appId: "synthetic-access-test",
};
const provider = (name: string, emailVerified = true): ProviderIdentity => ({
  authority: "auth0",
  issuer: "https://auth.example.invalid",
  subject: `${prefix}-${name}`,
  email: `${prefix}-${name}@example.invalid`,
  emailVerified,
});
async function signup(
  name: string,
  status: "pending" | "confirmed" | "suppressed" = "confirmed"
) {
  const [row] = await db
    .insert(schema.waitlistSignups)
    .values({
      email: `${prefix}-${name}@example.invalid`,
      normalizedEmail: `${prefix}-${name}@example.invalid`,
      status,
      confirmedAt: status === "confirmed" ? new Date() : null,
      referralCode: randomUUID(),
      firstTouch: { utm_source: "fixture" },
      lastTouch: {},
    })
    .returning();
  signupIds.push(row.id);
  return row;
}
async function enroll(name: string) {
  const identity = provider(name);
  const canonical = await resolveProviderIdentity(identity);
  const result = await enrollAuthenticatedUser(identity, canonical);
  if (result.signupId) signupIds.push(result.signupId);
  return { identity, canonical, result };
}
async function action(
  ids: string[],
  action: "approve" | "revoke" = "approve",
  requestId = randomUUID()
) {
  return mutateAccessSelection(actor, { requestId, action, signupIds: ids });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "early-access domains against isolated Postgres",
  () => {
    beforeAll(async () => {
      const isolated = await openIntegrationDatabase(process.env);
      client = isolated.client;
      db = drizzle(client, { schema });
      vi.mocked(getDb).mockImplementation(() => db);
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.example.invalid");
      const admin = await signup("admin");
      const adminIdentity = await enroll("admin");
      const [grant] = await db
        .insert(schema.adminRoleGrants)
        .values({ signupId: admin.id, source: "synthetic_fixture" })
        .returning();
      actor = {
        signupId: admin.id,
        adminGrantId: grant.id,
        userId: adminIdentity.canonical.userId,
      };
    });
    afterAll(async () => {
      // Audit is immutable. Retain synthetic fixtures only in this disposable DB;
      // clear our delivery work so another suite's worker cannot dispatch it.
      if (signupIds.length && db)
        await db
          .update(schema.emailOutbox)
          .set({ processedAt: new Date(), payload: {} })
          .where(inArray(schema.emailOutbox.signupId, signupIds));
      await client?.end();
      vi.unstubAllEnvs();
    });
    it("enrolls unknown verified users once without consent, including concurrent login", async () => {
      const identity = provider("unknown");
      const canonical = await resolveProviderIdentity(identity);
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          enrollAuthenticatedUser(identity, canonical)
        )
      );
      expect(new Set(results.map((row) => row.signupId)).size).toBe(1);
      signupIds.push(results[0].signupId!);
      expect(await getAccessDecision(canonical.userId)).toMatchObject({
        state: "pending",
      });
      const rows = await db
        .select()
        .from(schema.emailSubscriptions)
        .where(eq(schema.emailSubscriptions.userId, canonical.userId));
      expect(rows).toHaveLength(0);
      expect(await getNewsletterConsent(identity.email!)).toBe(false);
    }, 60000);
    it("admits canonical administrators without a product grant but explicit revocation overrides their role", async () => {
      const admin = await enroll("separate-admin");
      expect((await getAccessDecision(admin.canonical.userId)).state).toBe(
        "pending"
      );
      await db.insert(schema.adminRoleGrants).values({
        signupId: admin.result.signupId!,
        source: "synthetic_fixture",
      });
      expect((await getAccessDecision(admin.canonical.userId)).state).toBe(
        "approved"
      );
      expect(
        (await action([admin.result.signupId!], "revoke")).outcomes[0].outcome
      ).toBe("revoked");
      expect((await getAccessDecision(admin.canonical.userId)).state).toBe(
        "revoked"
      );
    }, 30000);
    it("confirms a pending entry preserving attribution/referral and never revives suppressed contacts", async () => {
      const row = await signup("pending", "pending");
      const referrer = await signup("referrer");
      await db
        .update(schema.waitlistSignups)
        .set({ referredBy: referrer.id })
        .where(eq(schema.waitlistSignups.id, row.id));
      const { canonical } = await enroll("pending");
      const [linked] = await db
        .select()
        .from(schema.waitlistSignups)
        .where(eq(schema.waitlistSignups.id, row.id));
      expect(linked).toMatchObject({
        status: "confirmed",
        userId: canonical.userId,
        referredBy: referrer.id,
        firstTouch: { utm_source: "fixture" },
      });
      const points = await db
        .select()
        .from(schema.pointEvents)
        .where(eq(schema.pointEvents.referralSignupId, row.id));
      expect(points).toHaveLength(1);
      await signup("suppressed", "suppressed");
      expect((await enroll("suppressed")).result).toMatchObject({
        enrolled: false,
        reason: "inactive_contact",
      });
    }, 60000);
    it("rejects unverified, changed-email, and conflicting link claims", async () => {
      const identity = provider("unverified", false);
      const canonical = await resolveProviderIdentity(identity);
      expect(await enrollAuthenticatedUser(identity, canonical)).toMatchObject({
        enrolled: false,
      });
      const initial = await enroll("changed");
      const changed = {
        ...initial.identity,
        email: provider("new-address").email,
      };
      expect(
        await enrollAuthenticatedUser(
          changed,
          await resolveProviderIdentity(changed)
        )
      ).toMatchObject({ enrolled: false, reason: "waitlist_conflict" });
      const attacker = {
        ...provider("conflicting-provider"),
        email: initial.identity.email,
      };
      const independent = await resolveProviderIdentity(attacker);
      expect(independent.userId).not.toBe(initial.canonical.userId);
      expect(
        await enrollAuthenticatedUser(attacker, independent)
      ).toMatchObject({ enrolled: false, reason: "email_conflict" });
    }, 60000);
    it("preapproves one contact, binds after verified login, and revocation survives repeat enrollment", async () => {
      const row = await signup("preapproved");
      expect((await action([row.id])).outcomes[0].outcome).toBe("approved");
      const { identity, canonical } = await enroll("preapproved");
      expect(await getAccessDecision(canonical.userId)).toMatchObject({
        state: "approved",
      });
      const account = await resolveExternalAccount({
        ...scope,
        userId: canonical.userId,
        identityId: canonical.identityId,
      });
      expect(
        await requireApprovedExternalAccount(scope, account.externalUserId)
      ).toMatchObject({ userId: canonical.userId });
      await action([row.id], "revoke");
      await enrollAuthenticatedUser(identity, canonical);
      await expect(
        requireApprovedExternalAccount(scope, account.externalUserId)
      ).rejects.toMatchObject({ status: 403, state: "revoked" });
      expect(await getAccessDecision(canonical.userId)).toMatchObject({
        state: "revoked",
      });
    }, 60000);
    it("sorts unverified contacts last across pages and supports a debugging filter without deleting them", async () => {
      const pending = await signup("visibility-pending", "pending");
      const missingVerification = await signup(
        "visibility-missing-verification"
      );
      const verified = await signup("visibility-verified");
      await db
        .update(schema.waitlistSignups)
        .set({ confirmedAt: null })
        .where(eq(schema.waitlistSignups.id, missingVerification.id));
      for (const state of ["all", "waiting", "approved", "revoked"]) {
        const filters = parseAccessFilters(
          new URLSearchParams({ search: `${prefix}-visibility-`, state })
        );
        const expected =
          state === "all"
            ? [verified.id, pending.id, missingVerification.id]
            : state === "waiting"
              ? [verified.id]
              : [];
        const list = await listAccessEntries(filters);
        expect(list.rows.map((row) => row.id)).toEqual(expected);
        expect(list.total).toBe(expected.length);
        expect(await freezeAccessSelection(filters)).toEqual({
          signupIds: expected,
          total: expected.length,
        });
      }
      const retained = await db
        .select()
        .from(schema.waitlistSignups)
        .where(
          inArray(schema.waitlistSignups.id, [
            pending.id,
            missingVerification.id,
          ])
        );
      expect(retained).toHaveLength(2);
      const firstPage = parseAccessFilters(
        new URLSearchParams({
          search: `${prefix}-visibility-`,
          state: "all",
          pageSize: "1",
        })
      );
      expect(
        (await listAccessEntries(firstPage)).rows.map((row) => row.id)
      ).toEqual([verified.id]);
      expect(
        (await listAccessEntries({ ...firstPage, page: 2 })).rows.map(
          (row) => row.id
        )
      ).toEqual([pending.id]);
      const debugFilters = parseAccessFilters(
        new URLSearchParams({
          search: `${prefix}-visibility-`,
          state: "unverified",
        })
      );
      const debugList = await listAccessEntries(debugFilters);
      expect(debugList.rows.map((row) => row.id).sort()).toEqual(
        [pending.id, missingVerification.id].sort()
      );
      expect(debugList.total).toBe(2);
      expect(
        (await freezeAccessSelection(debugFilters)).signupIds.sort()
      ).toEqual([pending.id, missingVerification.id].sort());
      await db.insert(schema.emailSubscriptions).values([
        {
          normalizedEmail: verified.normalizedEmail,
          signupId: verified.id,
          purpose: "product_marketing",
          status: "subscribed",
          source: "synthetic_fixture",
        },
        {
          normalizedEmail: pending.normalizedEmail,
          signupId: pending.id,
          purpose: "product_marketing",
          status: "subscribed",
          source: "synthetic_fixture",
        },
        {
          normalizedEmail: missingVerification.normalizedEmail,
          signupId: missingVerification.id,
          purpose: "other_purpose",
          status: "subscribed",
          source: "synthetic_fixture",
        },
      ]);
      const subscribedFilters = parseAccessFilters(
        new URLSearchParams({
          search: `${prefix}-visibility-`,
          state: "subscribed",
        })
      );
      const subscribedList = await listAccessEntries(subscribedFilters);
      expect(subscribedList.rows.map((row) => row.id)).toEqual([
        verified.id,
        pending.id,
      ]);
      expect(subscribedList.total).toBe(2);
      expect(
        subscribedList.rows.every(
          (row) => row.newsletterSubscribed && row.accessState === "pending"
        )
      ).toBe(true);
      expect(
        (await freezeAccessSelection(subscribedFilters)).signupIds
      ).toEqual([verified.id, pending.id]);
      const exported = await exportAccessSelection([pending.id, verified.id]);
      expect(exported.map((row) => row.email)).toEqual([
        pending.email,
        verified.email,
      ]);
      await expect(exportAccessSelection([randomUUID()])).rejects.toMatchObject(
        { code: "selection_changed" }
      );
    }, 60000);
    it("handles25 explicit IDs across pages, idempotent retries and no duplicate invitations", async () => {
      const rows = await Promise.all(
        Array.from({ length: 25 }, (_, i) => signup(`bulk-${i}`))
      );
      const filters = parseAccessFilters(
        new URLSearchParams({
          search: `${prefix}-bulk-`,
          state: "waiting",
          pageSize: "10",
        })
      );
      expect((await listAccessEntries(filters)).rows).toHaveLength(10);
      const frozen = await freezeAccessSelection(filters);
      expect(frozen.total).toBe(25);
      const requestId = randomUUID();
      const first = await action(frozen.signupIds, "approve", requestId);
      expect(first.outcomes.every((item) => item.outcome === "approved")).toBe(
        true
      );
      expect(
        await action([...frozen.signupIds].reverse(), "approve", requestId)
      ).toEqual(first);
      expect(
        (await action(frozen.signupIds)).outcomes.every(
          (item) => item.outcome === "unchanged"
        )
      ).toBe(true);
      const invitations = await db
        .select()
        .from(schema.emailOutbox)
        .where(
          inArray(
            schema.emailOutbox.signupId,
            rows.map((row) => row.id)
          )
        );
      expect(invitations).toHaveLength(25);
      await expect(
        action([rows[0].id], "revoke", requestId)
      ).rejects.toMatchObject({ status: 409 });
    }, 180000);
    it("commits per-record outcomes and retries failed records without repeating completed work", async () => {
      const pending = await signup("partial-pending", "pending");
      const ready = await signup("partial-ready");
      const requestId = randomUUID();
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
      const first = await action([pending.id, ready.id], "approve", requestId);
      expect(
        first.outcomes.find((row) => row.signupId === pending.id)?.outcome
      ).toBe("ineligible");
      expect(
        first.outcomes.find((row) => row.signupId === ready.id)?.outcome
      ).toBe("failed");
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.example.invalid");
      const retry = await action([pending.id, ready.id], "approve", requestId);
      expect(
        retry.outcomes.find((row) => row.signupId === ready.id)?.outcome
      ).toBe("approved");
    }, 60000);
    it("serializes concurrent approve/revoke and keeps audits consistent", async () => {
      const row = await signup("concurrent-grant");
      await Promise.all([action([row.id]), action([row.id], "revoke")]);
      const [grant] = await db
        .select()
        .from(schema.accessGrants)
        .where(eq(schema.accessGrants.signupId, row.id));
      const events = await db
        .select()
        .from(schema.accessEvents)
        .where(eq(schema.accessEvents.grantId, grant.id));
      expect(events).toHaveLength(2);
      expect(
        events.find((event) => event.grantVersion === grant.version)?.nextStatus
      ).toBe(grant.status);
    }, 60000);
    it("separates subscriptions, grants and explicit provider portability", async () => {
      const { canonical, identity, result } = await enroll("portable");
      await action([result.signupId!]);
      await changeNewsletterConsent(
        result.signupId!,
        true,
        "synthetic_explicit_consent"
      );
      const account = await resolveExternalAccount({
        ...scope,
        userId: canonical.userId,
        identityId: canonical.identityId,
      });
      const alternate = await linkProviderIdentityToUser(
        {
          ...identity,
          authority: "test-alternate",
          issuer: "https://alternate.example.invalid",
          subject: randomUUID(),
        },
        {
          userId: canonical.userId,
          existingIdentityId: canonical.identityId,
          evidenceReference: "synthetic-owned-provider-proof",
        }
      );
      expect(alternate.userId).toBe(canonical.userId);
      expect(
        await resolveExternalAccount({
          ...scope,
          userId: alternate.userId,
          identityId: alternate.identityId,
        })
      ).toEqual(account);
      expect(await getNewsletterConsent(identity.email!)).toBe(true);
      const decision = await getAccessDecision(alternate.userId);
      expect(decision.state).toBe("approved");
      await changeNewsletterConsent(
        result.signupId!,
        false,
        "synthetic_explicit_consent"
      );
      expect((await getAccessDecision(alternate.userId)).grantId).toBe(
        decision.grantId
      );
      await action([result.signupId!], "revoke");
      expect(await getNewsletterConsent(identity.email!)).toBe(false);
    }, 60000);
    it("reconciles stale opt-in events to the latest unsubscribe and serializes consent with delivery", async () => {
      const { result, identity, canonical } = await enroll("stale-consent");
      const staleEvent = await changeNewsletterConsent(
        result.signupId!,
        true,
        "synthetic_explicit_consent"
      );
      await changeNewsletterConsent(
        result.signupId!,
        false,
        "synthetic_explicit_consent"
      );
      const updateContact = vi.fn().mockResolvedValue(undefined);
      expect(
        await dispatchOutboxEvent(staleEvent!, {
          audienceProvider: { updateContact },
        })
      ).toBe("delivered");
      expect(updateContact).toHaveBeenCalledWith(
        expect.objectContaining({ subscribed: false })
      );
      expect((await getAccessDecision(canonical.userId)).state).toBe("pending");

      await changeNewsletterConsent(
        result.signupId!,
        true,
        "synthetic_explicit_consent"
      );
      let signalStarted!: () => void, finishDelivery!: () => void;
      const started = new Promise<void>((resolve) => {
        signalStarted = resolve;
      });
      const release = new Promise<void>((resolve) => {
        finishDelivery = resolve;
      });
      const order: string[] = [];
      const delivering = synchronizeNewsletterConsent({
        email: identity.email!,
        provider: {
          updateContact: async (input) => {
            expect(input.subscribed).toBe(true);
            signalStarted();
            await release;
            order.push("provider completed");
          },
        },
      });
      await started;
      const changing = changeNewsletterConsent(
        result.signupId!,
        false,
        "synthetic_explicit_consent"
      ).then(() => {
        order.push("unsubscribe committed");
      });
      finishDelivery();
      await Promise.all([delivering, changing]);
      expect(order).toEqual(["provider completed", "unsubscribe committed"]);
      await synchronizeNewsletterConsent({
        email: identity.email!,
        provider: { updateContact },
      });
      expect(updateContact).toHaveBeenLastCalledWith(
        expect.objectContaining({ subscribed: false })
      );
      expect(await getNewsletterConsent(identity.email!)).toBe(false);
    }, 60000);

    it("denies unknown scope, disabled accounts, unavailable DB and revoked administrators", async () => {
      await expect(
        requireApprovedExternalAccount(scope, "unknown")
      ).rejects.toMatchObject({ status: 403 });
      const { canonical, result } = await enroll("disabled");
      await action([result.signupId!]);
      await db
        .update(schema.users)
        .set({ status: "disabled" })
        .where(eq(schema.users.id, canonical.userId));
      expect(await getAccessDecision(canonical.userId)).toMatchObject({
        state: "disabled",
      });
      vi.mocked(getDb).mockImplementationOnce(() => {
        throw new Error("database unavailable");
      });
      expect(await getAccessDecision(canonical.userId)).toMatchObject({
        state: "unavailable",
      });
      const adminIdentity = await enroll("admin");
      await db
        .update(schema.users)
        .set({ status: "disabled" })
        .where(eq(schema.users.id, adminIdentity.canonical.userId));
      await expect(action([result.signupId!])).rejects.toMatchObject({
        status: 403,
        state: "disabled",
      });
      await db
        .update(schema.users)
        .set({ status: "active" })
        .where(eq(schema.users.id, adminIdentity.canonical.userId));
      await db
        .update(schema.adminRoleGrants)
        .set({ revokedAt: new Date() })
        .where(eq(schema.adminRoleGrants.id, actor.adminGrantId));
      await expect(action([result.signupId!])).rejects.toMatchObject({
        status: 403,
      });
      expect(
        await db
          .select()
          .from(schema.accessOperations)
          .where(
            and(
              eq(schema.accessOperations.actorAdminGrantId, actor.adminGrantId),
              eq(schema.accessOperations.action, "approve")
            )
          )
      ).not.toHaveLength(0);
    }, 60000);
  }
);
