import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { openIntegrationDatabase } from "@/tests/support/isolated-db";

import * as schema from "@/lib/db/schema";
import { externalUserIdFromSub } from "@/lib/console/external-user-id";
import {
  resolveProviderIdentity,
  linkProviderIdentityToUser,
} from "./provider-user";
import {
  resolveExternalAccount,
  findExternalAccountOwner,
} from "@/lib/external-accounts/service";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db";
import {
  syncCanonicalUser,
  syncCanonicalUserBestEffort,
} from "./canonical-user";

// Opt-in only: require both a test URL and an independently supplied hostname.
// Never fall back to DATABASE_URL (which can contain production credentials).
const databaseUrl = process.env.TEST_DATABASE_URL;
const prefix = `identity-test-${randomUUID()}`;
const subject = (name: string) => `auth0|${prefix}-${name}`;
const email = (name: string) => `${prefix}-${name}@example.invalid`;
let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof getDb>;
const userIds = new Set<string>();
const scope = {
  service: "pymthouse" as const,
  issuer: "https://issuer.example.invalid",
  appId: "isolated-test-app",
};
const providerInput = (name: string) => ({
  authority: "auth0",
  issuer: "https://auth.example.invalid",
  subject: subject(name),
  email: email(name),
  emailVerified: true,
});

async function sync(name: string, address = email(name), verified = true) {
  const result = await syncCanonicalUser({
    sub: subject(name),
    email: address,
    emailVerified: verified,
  });
  userIds.add(result.userId);
  return result;
}

async function signup(
  name: string,
  status: "pending" | "confirmed" = "confirmed",
  userId?: string
) {
  const [row] = await db
    .insert(schema.waitlistSignups)
    .values({
      email: email(name),
      normalizedEmail: email(name),
      status,
      userId,
      referralCode: randomUUID(),
      firstTouch: {},
      lastTouch: {},
    })
    .returning();
  return row;
}

describe.skipIf(!databaseUrl)(
  "canonical identities against isolated Postgres",
  () => {
    beforeAll(async () => {
      vi.stubEnv("AUTH0_DOMAIN", "auth.example.invalid");
      vi.stubEnv("PYMTHOUSE_ISSUER_URL", scope.issuer);
      vi.stubEnv("PYMTHOUSE_PUBLIC_CLIENT_ID", scope.appId);
      const isolated = await openIntegrationDatabase({
        TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
        TEST_DATABASE_HOST: process.env.TEST_DATABASE_HOST,
        TEST_DATABASE_BRANCH_ID: process.env.TEST_DATABASE_BRANCH_ID,
      });
      client = isolated.client;
      db = drizzle(client, { schema });
      vi.mocked(getDb).mockImplementation(() => db);
      await client`select 1`;
    });

    afterEach(async () => {
      vi.mocked(getDb).mockImplementation(() => db);
      if (!db) return;
      // Delete only this run's synthetic fixtures; no truncation or shared data.
      const identities = await db
        .select({ userId: schema.authIdentities.userId })
        .from(schema.authIdentities)
        .where(like(schema.authIdentities.providerSubject, `auth0|${prefix}%`));
      identities.forEach(({ userId }) => userIds.add(userId));
      await db
        .delete(schema.waitlistSignups)
        .where(like(schema.waitlistSignups.normalizedEmail, `${prefix}%`));
      if (userIds.size) {
        const ownedIdentities = await db
          .select({ id: schema.authIdentities.id })
          .from(schema.authIdentities)
          .where(inArray(schema.authIdentities.userId, [...userIds]));
        if (ownedIdentities.length)
          await db.delete(schema.identityExternalAccounts).where(
            inArray(
              schema.identityExternalAccounts.identityId,
              ownedIdentities.map((row) => row.id)
            )
          );
        await db
          .delete(schema.externalAccounts)
          .where(inArray(schema.externalAccounts.userId, [...userIds]));
        await db
          .delete(schema.users)
          .where(inArray(schema.users.id, [...userIds]));
      }
      userIds.clear();
      vi.restoreAllMocks();
    });

    afterAll(async () => {
      await client?.end();
      vi.unstubAllEnvs();
    });

    it("creates UUID identities with a newly allocated provider-independent external ID", async () => {
      const result = await sync("new", email("new").toUpperCase());
      expect(result.userId).toMatch(/^[a-f0-9-]{36}$/);
      expect(result.identityCreated).toBe(true);
      expect(result.accountStatus).toBe("active");
      const [identity] = await db
        .select()
        .from(schema.authIdentities)
        .where(eq(schema.authIdentities.userId, result.userId));
      expect(identity.providerMetadata).toEqual({
        authority: "auth0",
        strategy: "auth0",
      });
      expect(result.externalUserId).toMatch(/^eu_[a-f0-9]{32}$/);
      expect(identity.externalUserId).toBeNull();
      const [record] = await db
        .select()
        .from(schema.userEmails)
        .where(eq(schema.userEmails.userId, result.userId));
      expect(record.email).toBe(email("new").toUpperCase());
      expect(record.normalizedEmail).toBe(email("new"));
      expect(record.verifiedAt).toBeInstanceOf(Date);
      expect(record.isPrimary).toBe(true);
    });

    it("is idempotent even for simultaneous first logins", async () => {
      const results = await Promise.all(
        Array.from({ length: 4 }, () => sync("repeat"))
      );
      expect(new Set(results.map((r) => r.userId)).size).toBe(1);
      expect(results.filter((r) => r.identityCreated)).toHaveLength(1);
    });

    it("does not reactivate a disabled profile during login reconciliation", async () => {
      const first = await sync("disabled");
      await db
        .update(schema.users)
        .set({ status: "disabled", disabledAt: new Date() })
        .where(eq(schema.users.id, first.userId));
      const repeated = await sync("disabled");
      expect(repeated.userId).toBe(first.userId);
      expect(repeated.accountStatus).toBe("disabled");
    });

    it("does not create users for waitlist-only contacts", async () => {
      const entry = await signup("contact");
      expect(entry.userId).toBeNull();
      expect(
        await db
          .select()
          .from(schema.userEmails)
          .where(eq(schema.userEmails.normalizedEmail, entry.normalizedEmail))
      ).toHaveLength(0);
    });

    it("links verified confirmed membership once", async () => {
      const entry = await signup("confirmed");
      const result = await sync("confirmed");
      expect(result.waitlistLinked).toBe(true);
      expect((await sync("confirmed")).waitlistLinked).toBe(false);
      const [linked] = await db
        .select()
        .from(schema.waitlistSignups)
        .where(eq(schema.waitlistSignups.id, entry.id));
      expect(linked.userId).toBe(result.userId);
    });

    it("rejects unverified email linking and reconciles after verification", async () => {
      await signup("unverified");
      const first = await sync("unverified", email("unverified"), false);
      expect(first.waitlistLinked).toBe(false);
      const second = await sync("unverified");
      expect(second.userId).toBe(first.userId);
      expect(second.waitlistLinked).toBe(true);
    });

    it("leaves pending membership unlinked until confirmation and a later request", async () => {
      const entry = await signup("pending", "pending");
      const first = await sync("pending");
      expect(first.waitlistLinked).toBe(false);
      await db
        .update(schema.waitlistSignups)
        .set({ status: "confirmed" })
        .where(eq(schema.waitlistSignups.id, entry.id));
      expect((await sync("pending")).waitlistLinked).toBe(true);
    });

    it("preserves a waitlist entry already claimed by another user", async () => {
      const owner = await sync("owner");
      const entry = await signup("claimed", "confirmed", owner.userId);
      const contender = await sync("claimed");
      expect(contender.conflicts).toEqual(["waitlist_link"]);
      const [unchanged] = await db
        .select()
        .from(schema.waitlistSignups)
        .where(eq(schema.waitlistSignups.id, entry.id));
      expect(unchanged.userId).toBe(owner.userId);
    });

    it("logs a second membership conflict without rolling back an email change", async () => {
      await signup("first");
      const first = await sync("first");
      const secondEntry = await signup("second");
      const updated = await sync("first", email("second"));
      expect(updated.userId).toBe(first.userId);
      expect(updated.conflicts).toEqual(["waitlist_link"]);
      const [second] = await db
        .select()
        .from(schema.waitlistSignups)
        .where(eq(schema.waitlistSignups.id, secondEntry.id));
      expect(second.userId).toBeNull();
      const primaries = await db
        .select()
        .from(schema.userEmails)
        .where(
          and(
            eq(schema.userEmails.userId, first.userId),
            eq(schema.userEmails.isPrimary, true)
          )
        );
      expect(primaries.map((r) => r.normalizedEmail)).toEqual([
        email("second"),
      ]);
    });

    it("does not steal another user's verified email from an existing identity", async () => {
      const owner = await sync("email-owner");
      const existing = await sync("other");
      const updated = await sync("other", email("email-owner"));
      expect(updated.userId).toBe(existing.userId);
      expect(updated.conflicts).toEqual(["verified_email"]);
      const [record] = await db
        .select()
        .from(schema.userEmails)
        .where(eq(schema.userEmails.normalizedEmail, email("email-owner")));
      expect(record.userId).toBe(owner.userId);
    });

    it("never links another identity by verified email alone", async () => {
      const first = await sync("provider-one");
      const second = await sync("provider-two", email("provider-one"));
      expect(second.userId).not.toBe(first.userId);
      expect(second.conflicts).toContain("verified_email");
      expect(second.externalUserId).not.toBe(first.externalUserId);
      expect(second.externalUserId).toMatch(/^eu_[a-f0-9]{32}$/);
    });

    it("fails open during database outage and reconciles on retry", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(getDb).mockImplementationOnce(() => {
        throw new Error("simulated database outage");
      });
      const input = {
        sub: subject("retry"),
        email: email("retry"),
        emailVerified: true,
      };
      expect(await syncCanonicalUserBestEffort(input)).toBeNull();
      const retried = await syncCanonicalUserBestEffort(input);
      expect(retried?.identityCreated).toBe(true);
      expect(retried?.externalUserId).toMatch(/^eu_[a-f0-9]{32}$/);
    });

    it("retains both legacy account aliases with explicit identity bindings", async () => {
      const alias1 = await externalUserIdFromSub(subject("legacy-one"));
      const alias2 = await externalUserIdFromSub(subject("legacy-two"));
      const [legacyUser] = await db.insert(schema.users).values({}).returning();
      userIds.add(legacyUser.id);
      // Model the reviewed legacy backfill: original aliases are inserted once,
      // never obtained by rewriting a newly allocated immutable account.
      for (const [name, alias] of [
        ["legacy-one", alias1],
        ["legacy-two", alias2],
      ]) {
        const [identity] = await db
          .insert(schema.authIdentities)
          .values({
            userId: legacyUser.id,
            authority: "auth0",
            issuer: "https://auth.example.invalid",
            provider: "auth0",
            providerSubject: subject(name),
            externalUserId: alias,
          })
          .returning();
        const [account] = await db
          .insert(schema.externalAccounts)
          .values({
            userId: legacyUser.id,
            ...scope,
            externalUserId: alias,
            source: "synthetic_legacy_backfill",
          })
          .returning();
        await db.insert(schema.identityExternalAccounts).values({
          identityId: identity.id,
          externalAccountId: account.id,
        });
      }
      expect((await sync("legacy-one")).externalUserId).toBe(alias1);
      expect((await sync("legacy-two")).externalUserId).toBe(alias2);
      await expect(
        resolveExternalAccount({ ...scope, userId: legacyUser.id })
      ).rejects.toMatchObject({ code: "external_account_ambiguous" });
      expect(
        (await findExternalAccountOwner({ ...scope, externalUserId: alias2 }))
          ?.userId
      ).toBe(legacyUser.id);
      expect(
        await findExternalAccountOwner({
          ...scope,
          appId: "foreign-app",
          externalUserId: alias2,
        })
      ).toBeNull();
    });

    it("explicit alternate-provider linking preserves user and external account", async () => {
      const first = await sync("portable");
      const alternate = {
        ...providerInput("portable-new"),
        authority: "test-alternate",
        issuer: "https://alternate.example.invalid",
        email: email("portable"),
      };
      const linked = await linkProviderIdentityToUser(alternate, {
        userId: first.userId,
        existingIdentityId: first.identityId!,
        evidenceReference: "synthetic-migration-proof",
      });
      expect(linked.userId).toBe(first.userId);
      expect(linked.conflicts).toEqual([]);
      const account = await resolveExternalAccount({
        ...scope,
        userId: linked.userId,
        identityId: linked.identityId,
      });
      expect(account.externalUserId).toBe(first.externalUserId);
      expect((await resolveProviderIdentity(alternate)).userId).toBe(
        first.userId
      );
      await expect(
        linkProviderIdentityToUser(
          { ...alternate, subject: subject("bad-proof") },
          {
            userId: randomUUID(),
            existingIdentityId: first.identityId!,
            evidenceReference: "invalid-owner",
          }
        )
      ).rejects.toMatchObject({ code: "identity_link_conflict" });
    });

    it("rejects unresolved legacy issuer and never allocates a replacement alias", async () => {
      const first = await sync("unresolved");
      await db
        .update(schema.authIdentities)
        .set({ issuer: null })
        .where(eq(schema.authIdentities.id, first.identityId!));
      await expect(
        resolveProviderIdentity(providerInput("unresolved"))
      ).rejects.toMatchObject({ code: "identity_legacy_issuer_unresolved" });
      await db
        .update(schema.authIdentities)
        .set({
          issuer: "https://auth.example.invalid",
          externalUserId: "eu_unresolved_legacy",
        })
        .where(eq(schema.authIdentities.id, first.identityId!));
      await expect(
        resolveExternalAccount({
          ...scope,
          userId: first.userId,
          identityId: first.identityId!,
        })
      ).rejects.toMatchObject({ code: "external_account_legacy_unresolved" });
      const accounts = await db
        .select()
        .from(schema.externalAccounts)
        .where(eq(schema.externalAccounts.userId, first.userId));
      expect(accounts).toHaveLength(1);
      expect(accounts[0].externalUserId).toBe(first.externalUserId);
    });

    it("preserves waitlist membership when its canonical user is deleted", async () => {
      const entry = await signup("deleted");
      const result = await sync("deleted");
      await db
        .delete(schema.identityExternalAccounts)
        .where(
          eq(schema.identityExternalAccounts.identityId, result.identityId!)
        );
      await db
        .delete(schema.externalAccounts)
        .where(eq(schema.externalAccounts.userId, result.userId));
      await db.delete(schema.users).where(eq(schema.users.id, result.userId));
      const [retained] = await db
        .select()
        .from(schema.waitlistSignups)
        .where(eq(schema.waitlistSignups.id, entry.id));
      expect(retained.userId).toBeNull();
      expect(retained.status).toBe("confirmed");
    });
  }
);
