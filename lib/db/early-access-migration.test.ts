import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  authIdentities,
  accessGrants,
  accessEvents,
  externalAccounts,
  emailSubscriptions,
} from "./schema";
import {
  buildGrandfatherManifest,
  legacyExternalId,
  manifestSummary,
} from "../../scripts/early-access/manifest";
import {
  assertReviewedManifest,
  reconcileManifest,
} from "../../scripts/early-access/reconcile";

const sql = readFileSync(
  resolve(process.cwd(), "drizzle/0007_early_access_domains.sql"),
  "utf8"
);
const issuer = "https://login.example";
const subject = "auth0|synthetic-existing-user";
function input() {
  return {
    scope: {
      service: "pymthouse",
      issuer: "https://pymthouse.example/oidc",
      appId: "production-console",
    },
    auth0Issuer: issuer,
    cutoff: "2026-09-04T00:00:00.000Z",
    inventory: {
      users: [
        {
          id: "private-record",
          clientId: "production-console",
          externalUserId: legacyExternalId(subject),
          email: "synthetic@example.invalid",
          status: "active",
          role: "user",
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    },
    evidence: [
      {
        subject,
        issuer,
        source: "console_authentication",
        occurredAt: "2026-09-02T00:00:00.000Z",
      },
    ],
  };
}
const uniqueColumns = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table)
    .indexes.filter((entry) => entry.config.unique)
    .map((entry) =>
      entry.config.columns.map((column) =>
        "name" in column ? column.name : String(column)
      )
    );

describe("early-access migration and grandfather planning", () => {
  it("prelocks all identities in sorted order before any shared-user lock", async () => {
    const fixture = input();
    const secondSubject = "auth0|another-provider-identity-same-user";
    fixture.inventory.users.push({
      ...fixture.inventory.users[0],
      id: "second-record",
      externalUserId: legacyExternalId(secondSubject),
    });
    fixture.evidence.push({ ...fixture.evidence[0], subject: secondSubject });
    const manifest = buildGrandfatherManifest(fixture);
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const tx = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("?").replace(/\s+/g, " ").trim();
      calls.push({ query, values });
      if (query.includes("FROM auth_identities")) {
        const currentSubject = values.includes(secondSubject)
          ? secondSubject
          : subject;
        return [
          {
            id: currentSubject,
            user_id: "shared-user",
            issuer,
            external_user_id: legacyExternalId(currentSubject),
            status: "active",
          },
        ];
      }
      if (query.startsWith("SELECT id, user_id FROM external_accounts"))
        return [{ id: `account-${values.at(-1)}`, user_id: "shared-user" }];
      if (
        query.startsWith(
          "SELECT id, user_id, signup_id, status FROM access_grants"
        )
      )
        return [{ id: "grant", user_id: "shared-user", status: "approved" }];
      return [];
    };
    const client = {
      begin: (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as Parameters<typeof reconcileManifest>[0];
    const result = await reconcileManifest(client, manifest, {
      reviewedChecksum: manifest.manifestChecksum,
      apply: true,
    });
    const identityLocks = calls.flatMap((call, index) =>
      call.values
        .filter(
          (value): value is string =>
            typeof value === "string" && value.startsWith("identity:")
        )
        .map((key) => ({ key, index }))
    );
    expect(identityLocks.map((lock) => lock.key)).toEqual(
      [subject, secondSubject]
        .map((value) => `identity:auth0:${issuer}:${value}`)
        .sort()
    );
    const firstUserLock = calls.findIndex((call) =>
      call.values.includes("user:shared-user")
    );
    expect(firstUserLock).toBeGreaterThan(identityLocks[1].index);
    expect(
      calls.findIndex((call) => /^(INSERT|UPDATE)/.test(call.query))
    ).toBeGreaterThan(identityLocks[1].index);
    expect(
      calls.findIndex((call) => call.query.includes("FOR UPDATE"))
    ).toBeGreaterThan(firstUserLock);
    expect(result).toMatchObject({
      inspected: 2,
      blockers: 0,
      grantsCreated: 0,
    });
  });
  it.each([false, true])(
    "locks user advisory before rows and revalidates changed ownership=%s",
    async (changedOwner) => {
      const manifest = buildGrandfatherManifest(input());
      const calls: Array<{ query: string; values: unknown[] }> = [];
      const tx = async (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => {
        const query = strings.join("?").replace(/\s+/g, " ").trim();
        calls.push({ query, values });
        if (query.includes("FROM auth_identities")) {
          return [
            {
              id: "identity",
              user_id:
                changedOwner && query.includes("FOR UPDATE")
                  ? "new-owner"
                  : "original-owner",
              issuer,
              external_user_id: legacyExternalId(subject),
              status: "active",
            },
          ];
        }
        if (query.startsWith("SELECT id, user_id FROM external_accounts"))
          return [{ id: "account", user_id: "original-owner" }];
        if (
          query.startsWith(
            "SELECT id, user_id, signup_id, status FROM access_grants"
          )
        )
          return [
            { id: "grant", user_id: "original-owner", status: "approved" },
          ];
        return [];
      };
      const client = {
        begin: (callback: (executor: typeof tx) => Promise<unknown>) =>
          callback(tx),
      } as unknown as Parameters<typeof reconcileManifest>[0];
      const result = await reconcileManifest(client, manifest, {
        reviewedChecksum: manifest.manifestChecksum,
        apply: true,
      });
      const identityLock = calls.findIndex((call) =>
        call.values.some(
          (value) => typeof value === "string" && value.startsWith("identity:")
        )
      );
      const lookup = calls.findIndex((call) =>
        call.query.includes("FROM auth_identities")
      );
      const userLock = calls.findIndex((call) =>
        call.values.includes("user:original-owner")
      );
      const rowLock = calls.findIndex((call) =>
        call.query.includes("FOR UPDATE")
      );
      expect(identityLock).toBeGreaterThan(-1);
      expect(lookup).toBeGreaterThan(identityLock);
      expect(userLock).toBeGreaterThan(lookup);
      expect(rowLock).toBeGreaterThan(userLock);
      expect(result.blockers).toBe(changedOwner ? 1 : 0);
      if (changedOwner)
        expect(calls.some((call) => /^(INSERT|UPDATE)/.test(call.query))).toBe(
          false
        );
    }
  );
  it("keeps journal history and appends domain and single-use code migrations", () => {
    const journal = JSON.parse(
      readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8")
    );
    expect(journal.entries[7].tag).toBe("0007_early_access_domains");
    expect(journal.entries[8].tag).toBe("0008_oauth_code_redemptions");
    expect(journal.entries[9].tag).toBe("0009_mcp_assets");
    expect(journal.entries[10].tag).toBe("0010_run_records");
    expect(journal.entries).toHaveLength(11);
  });
  it("scopes identities/accounts and permits multiple accounts per user", () => {
    expect(authIdentities.externalUserId.notNull).toBe(false);
    expect(authIdentities.issuer.notNull).toBe(false);
    expect(uniqueColumns(authIdentities)).toContainEqual([
      "authority",
      "issuer",
      "provider_subject",
    ]);
    expect(uniqueColumns(externalAccounts)).toContainEqual([
      "service",
      "issuer",
      "app_id",
      "external_user_id",
    ]);
    expect(uniqueColumns(externalAccounts)).not.toContainEqual([
      "user_id",
      "service",
      "issuer",
      "app_id",
    ]);
  });
  it("defines separate approval and subscription uniqueness", () => {
    expect(uniqueColumns(accessGrants)).toContainEqual(["user_id"]);
    expect(uniqueColumns(accessGrants)).toContainEqual(["signup_id"]);
    expect(uniqueColumns(accessEvents)).toContainEqual([
      "grant_id",
      "grant_version",
    ]);
    expect(uniqueColumns(emailSubscriptions)).toContainEqual([
      "normalized_email",
      "purpose",
    ]);
  });
  it("never grants product access in schema migration and makes audits immutable", () => {
    expect(sql).not.toMatch(/INSERT INTO\s+(?:"?users"?|"?access_grants"?)\b/i);
    expect(sql).toContain("ON CONFLICT (signup_id, role) DO NOTHING");
    expect(sql).toContain("ON CONFLICT (normalized_email, purpose) DO NOTHING");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON access_events");
    expect(sql).toContain("BEFORE TRUNCATE ON access_events");
    expect(sql).toContain("legacy_consent_conflict");
  });
  it("maps actual Console evidence and emits sanitized summary", () => {
    const manifest = buildGrandfatherManifest(input());
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.unresolved).toEqual([]);
    assertReviewedManifest(manifest, manifest.manifestChecksum);
    expect(JSON.stringify(manifestSummary(manifest))).not.toContain(subject);
    expect(JSON.stringify(manifestSummary(manifest))).not.toContain(
      "synthetic@example.invalid"
    );
  });
  it("does not use email as identity evidence", () => {
    const fixture = input();
    fixture.evidence = [];
    const manifest = buildGrandfatherManifest(fixture);
    expect(manifest.entries).toEqual([]);
    expect(manifest.unresolved[0].reason).toBe(
      "missing_or_ambiguous_identity_evidence"
    );
    expect(() =>
      assertReviewedManifest(manifest, manifest.manifestChecksum)
    ).toThrow("Unresolved");
  });
  it("rejects another app, wrong issuer, inactive and duplicate accounts", () => {
    const wrongApp = input();
    wrongApp.inventory.users[0].clientId = "preview-console";
    expect(buildGrandfatherManifest(wrongApp).unresolved[0].reason).toBe(
      "wrong_app_scope"
    );
    const wrongIssuer = input();
    wrongIssuer.evidence[0].issuer = "https://attacker.example";
    expect(buildGrandfatherManifest(wrongIssuer).entries).toEqual([]);
    const inactive = input();
    inactive.inventory.users[0].status = "inactive";
    expect(buildGrandfatherManifest(inactive).unresolved[0].reason).toBe(
      "nonactive_account_requires_review"
    );
    const duplicate = input();
    duplicate.inventory.users.push({
      ...duplicate.inventory.users[0],
      id: "other-record",
    });
    expect(buildGrandfatherManifest(duplicate).unresolved).toHaveLength(2);
  });
  it("excludes accounts or evidence after cutoff", () => {
    const laterAccount = input();
    laterAccount.inventory.users[0].createdAt = "2026-09-05T00:00:00.000Z";
    expect(buildGrandfatherManifest(laterAccount).excludedAfterCutoff).toBe(1);
    const laterEvidence = input();
    laterEvidence.evidence[0].occurredAt = "2026-09-05T00:00:00.000Z";
    expect(buildGrandfatherManifest(laterEvidence).entries).toEqual([]);
  });
  it("rejects reviewed manifest alteration", () => {
    const manifest = buildGrandfatherManifest(input());
    const reviewed = manifest.manifestChecksum;
    manifest.entries[0].externalUserId = "eu_wrong";
    expect(() => assertReviewedManifest(manifest, reviewed)).toThrow(
      "checksum"
    );
  });
});
