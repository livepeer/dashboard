import { randomUUID } from "node:crypto";
import type { SQL } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { PgDialect } from "drizzle-orm/pg-core";
import type postgres from "postgres";
import { expect, it } from "vitest";
import { openIntegrationDatabase } from "@/tests/support/isolated-db";

/** Run Drizzle's actual migration/journal algorithm inside the outer rollback.
 * Only the schema namespace is rewritten; table definitions, constraints,
 * backfills, original file hashes and journal timestamps remain unchanged. */
async function migrateThrough(
  tx: postgres.TransactionSql,
  namespace: string,
  last: number
) {
  const dialect = new PgDialect();
  const execute = (query: SQL) => {
    const compiled = dialect.sqlToQuery(query);
    return tx.unsafe(
      compiled.sql,
      compiled.params as Parameters<typeof tx.unsafe>[1]
    );
  };
  const session = {
    execute,
    all: execute,
    transaction: async (
      work: (migration: { execute: typeof execute }) => Promise<void>
    ) => work({ execute }),
  };
  const migrations = readMigrationFiles({ migrationsFolder: "drizzle" })
    .slice(0, last + 1)
    .map((migration) => ({
      ...migration,
      sql: migration.sql.map((statement) =>
        statement.replaceAll('"public".', `"${namespace}".`)
      ),
    }));
  await dialect.migrate(
    migrations,
    session as unknown as Parameters<PgDialect["migrate"]>[1],
    {
      migrationsFolder: "drizzle",
      migrationsSchema: namespace,
    }
  );
  return migrations;
}

async function withIsolatedSchema(
  test: (tx: postgres.TransactionSql, namespace: string) => Promise<void>
) {
  const { client } = await openIntegrationDatabase(process.env);
  const rollback = new Error("rollback_full_run_history_migration");
  try {
    await expect(
      client.begin(async (tx) => {
        const namespace = `runupgrade_${randomUUID().replaceAll("-", "")}`;
        await tx.unsafe(`CREATE SCHEMA "${namespace}"`);
        await tx.unsafe(`SET LOCAL search_path TO "${namespace}", public`);
        await test(tx, namespace);
        throw rollback;
      })
    ).rejects.toBe(rollback);
  } finally {
    await client.end();
  }
}

it.skipIf(!process.env.TEST_DATABASE_URL)(
  "installs the complete real schema through0010 and Drizzle rerun is a no-op",
  async () => {
    await withIsolatedSchema(async (tx, namespace) => {
      const migrations = await migrateThrough(tx, namespace, 10);
      const tables =
        await tx`select table_name from information_schema.tables where table_schema=${namespace} and table_type='BASE TABLE'`;
      const names = tables.map((row) => row.table_name);
      for (const name of [
        "users",
        "auth_identities",
        "external_accounts",
        "waitlist_signups",
        "access_grants",
        "admin_role_grants",
        "consent_events",
        "email_outbox",
        "mcp_assets",
        "runs",
        "run_events",
        "run_reconciliation_jobs",
        "run_read_audits",
      ])
        expect(names).toContain(name);
      expect(names).toHaveLength(26); // 21 existing + 4 new + Drizzle journal.
      const before =
        await tx`select hash,created_at from __drizzle_migrations order by created_at`;
      expect(before.map((row) => row.hash)).toEqual(
        migrations.map((migration) => migration.hash)
      );
      expect(before).toHaveLength(11);
      await migrateThrough(tx, namespace, 10);
      expect(
        await tx`select hash,created_at from __drizzle_migrations order by created_at`
      ).toEqual(before);
    });
  },
  60000
);

it.skipIf(!process.env.TEST_DATABASE_URL)(
  "upgrades populated0009 without changing identities, access, consent, queued mail, or asset references",
  async () => {
    await withIsolatedSchema(async (tx, namespace) => {
      await migrateThrough(tx, namespace, 9);
      const [user] = await tx`insert into users default values returning id`;
      const [signup] =
        await tx`insert into waitlist_signups(email,normalized_email,referral_code,status,confirmed_at,user_id,first_touch,last_touch) values('history-upgrade@example.invalid','history-upgrade@example.invalid','history-upgrade','confirmed',now(),${user.id},'{}','{}') returning id`;
      await tx`insert into auth_identities(user_id,authority,issuer,provider,provider_subject) values(${user.id},'test','https://auth.example.invalid','test','auth0|history-upgrade')`;
      await tx`insert into external_accounts(user_id,service,issuer,app_id,external_user_id,source) values(${user.id},'pymthouse','https://billing.example.invalid','fixture-app','eu_fixture_history','migration_test')`;
      const [subscription] =
        await tx`insert into email_subscriptions(normalized_email,purpose,status,user_id,signup_id,source) values('history-upgrade@example.invalid','product_marketing','unsubscribed',${user.id},${signup.id},'migration_test') returning id`;
      await tx`insert into consent_events(signup_id,subscription_id,purpose,granted,disclosure_version,source) values(${signup.id},${subscription.id},'product_marketing',false,'fixture','migration_test')`;
      const [grant] =
        await tx`insert into access_grants(user_id,signup_id,status,source,approved_at) values(${user.id},${signup.id},'approved','migration_test',now()) returning id`;
      await tx`insert into access_events(grant_id,action,source,next_status,grant_version) values(${grant.id},'approve','migration_test','approved',1)`;
      await tx`insert into admin_role_grants(signup_id,source) values(${signup.id},'migration_test')`;
      await tx`insert into email_outbox(signup_id,event_type,payload,idempotency_key) values(${signup.id},'verification','{"synthetic":true}','history-upgrade-mail')`;
      await tx`insert into mcp_assets(id,principal_id,url,capability,gateway_request_id,provider_request_id,created_at) values('historical-output','eu_fixture_history','https://example.invalid/old-output.png','fal-ai/flux','historical-gateway','historical-provider',now()-interval '20 days')`;
      const preservedTables = [
        "users",
        "auth_identities",
        "external_accounts",
        "waitlist_signups",
        "email_subscriptions",
        "consent_events",
        "access_grants",
        "access_events",
        "admin_role_grants",
        "email_outbox",
      ];
      const before = new Map<string, unknown>();
      for (const table of preservedTables)
        before.set(
          table,
          await tx.unsafe(
            `select to_jsonb(t) as row from "${table}" t order by id`
          )
        );
      const assetsBefore =
        await tx`select id,principal_id,url,capability,gateway_request_id,provider_request_id,created_at from mcp_assets order by id`;
      const journalBefore =
        await tx`select hash,created_at from __drizzle_migrations order by created_at`;
      await migrateThrough(tx, namespace, 10);
      for (const table of preservedTables)
        expect(
          await tx.unsafe(
            `select to_jsonb(t) as row from "${table}" t order by id`
          ),
          table
        ).toEqual(before.get(table));
      expect(
        await tx`select id,principal_id,url,capability,gateway_request_id,provider_request_id,created_at from mcp_assets order by id`
      ).toEqual(assetsBefore);
      expect(
        (
          await tx`select hash,created_at from __drizzle_migrations order by created_at`
        ).slice(0, 10)
      ).toEqual(journalBefore);
      expect(
        (
          await tx`select run_id,available_until,expires_at,unavailable_at,hidden_at from mcp_assets`
        )[0]
      ).toEqual({
        run_id: null,
        available_until: null,
        expires_at: null,
        unavailable_at: null,
        hidden_at: null,
      });
      expect((await tx`select count(*)::int as n from runs`)[0].n).toBe(0);
      await migrateThrough(tx, namespace, 10);
      expect(
        (await tx`select count(*)::int as n from __drizzle_migrations`)[0].n
      ).toBe(11);
      expect((await tx`select count(*)::int as n from email_outbox`)[0].n).toBe(
        1
      );
    });
  },
  60000
);
