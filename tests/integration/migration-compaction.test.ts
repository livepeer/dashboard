import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type postgres from "postgres";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { transitionToBaseline } from "../../scripts/db/compact-migrations";
import { openIntegrationDatabase } from "@/tests/support/isolated-db";
import {
  replayMigrations,
  schemaCatalog,
} from "@/tests/support/migration-rehearsal";

const candidate = "drizzle-baseline";
const transition = (tx: postgres.TransactionSql, schema: string) =>
  transitionToBaseline(tx, { schema, journalSchema: schema });
async function rehearsal(
  work: (
    tx: postgres.TransactionSql,
    left: string,
    right: string
  ) => Promise<void>
) {
  const { client } = await openIntegrationDatabase(process.env);
  const rollback = Error("rollback_compaction_rehearsal");
  try {
    await client
      .begin(async (tx) => {
        await tx`SET LOCAL client_min_messages = warning`;
        const token = randomUUID().replaceAll("-", "");
        const left = `compact_${token}_a`,
          right = `compact_${token}_b`;
        await tx.unsafe(`CREATE SCHEMA "${left}"`);
        await tx.unsafe(`CREATE SCHEMA "${right}"`);
        await work(tx, left, right);
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
  } finally {
    await client.end();
  }
}

async function seedLegacy(tx: postgres.TransactionSql) {
  await tx`insert into waitlist_signups(id,email,normalized_email,referral_code,status,account_role,marketing_consent,first_touch,last_touch) values
    ('00000000-0000-0000-0000-000000000001','admin@example.invalid','admin@example.invalid','legacy-admin','confirmed','admin',true,'{"campaign":"keep"}','{}'),
    ('00000000-0000-0000-0000-000000000002','declined@example.invalid','declined@example.invalid','legacy-declined','confirmed','member',true,'{}','{}'),
    ('00000000-0000-0000-0000-000000000003','pending@example.invalid','pending@example.invalid','legacy-pending','pending','member',false,'{}','{}')`;
  await tx`insert into consent_events(signup_id,purpose,granted,disclosure_version,source) values
    ('00000000-0000-0000-0000-000000000001','product_marketing',true,'test','fixture'),
    ('00000000-0000-0000-0000-000000000002','product_marketing',false,'test','fixture')`;
  await tx`insert into email_outbox(signup_id,event_type,payload,idempotency_key) values ('00000000-0000-0000-0000-000000000001','verification','{"keep":true}','preserve-outbox')`;
  await tx`update waitlist_signups set referred_by='00000000-0000-0000-0000-000000000001' where id='00000000-0000-0000-0000-000000000002'`;
  await tx`insert into point_events(signup_id,points,reason,referral_signup_id) values ('00000000-0000-0000-0000-000000000001',10,'referral','00000000-0000-0000-0000-000000000002')`;
  await tx`insert into attribution_touches(signup_id,data) values ('00000000-0000-0000-0000-000000000001','{"campaign":"preserve"}')`;
  await tx`insert into sessions(signup_id,token_hash,expires_at) values ('00000000-0000-0000-0000-000000000001','synthetic-session',now()+interval '1 day')`;
  await tx`insert into verification_tokens(signup_id,token_hash,expires_at,requested_marketing_consent) values ('00000000-0000-0000-0000-000000000003','synthetic-token',now()+interval '1 day',true)`;
  await tx`insert into rate_limits(key_hash,bucket,attempts) values ('synthetic-key',now(),2)`;
}

async function seedCurrent(tx: postgres.TransactionSql) {
  const [user] = await tx`insert into users default values returning id`;
  const [account] =
    await tx`insert into external_accounts(user_id,service,issuer,app_id,external_user_id,source) values (${user.id},'pymthouse','https://billing.example.invalid','test-app','eu_compaction','fixture') returning id`;
  const [identity] =
    await tx`insert into auth_identities(user_id,provider,provider_subject,external_user_id) values (${user.id},'test','fixture-subject','eu_original_alias') returning id`;
  await tx`insert into identity_external_accounts(identity_id,external_account_id) values (${identity.id},${account.id})`;
  await tx`insert into user_emails(user_id,email,normalized_email,source,is_primary,verified_at) values (${user.id},'owner@example.invalid','owner@example.invalid','fixture',true,now())`;
  const [grant] =
    await tx`insert into access_grants(user_id,signup_id,status,source,approved_at) values (${user.id},'00000000-0000-0000-0000-000000000001','approved','fixture',now()) returning id`;
  await tx`insert into access_events(grant_id,action,source,next_status,grant_version) values (${grant.id},'approve','fixture','approved',1)`;
  await tx`insert into runs(id,principal_id,user_id,external_account_id,gateway_request_id,source,capability,status,submitted_arguments,result,completed_at) values ('fixture-run','eu_compaction',${user.id},${account.id},'fixture-gateway','mcp','image','succeeded','{"inputs":{"prompt":"Keep nested JSON","seed":42}}','{"value":{"outputs":["a","b"]}}',now())`;
  await tx`insert into run_events(run_id,event_key,status,metadata) values ('fixture-run','result','succeeded','{"evidence":"keep"}')`;
  await tx`insert into mcp_assets(id,principal_id,url,capability,gateway_request_id,run_id,hidden_at,unavailable_at) values ('fixture-media','eu_compaction','https://example.invalid/expired.png','image','fixture-gateway','fixture-run',now(),now())`;
  await tx`insert into run_reconciliation_jobs(run_id,queue,deadline_at,completed_at,last_reason) values ('fixture-run','{"fixture":true}',now(),now(),'fixture-complete')`;
  const [admin] = await tx`select id from admin_role_grants limit 1`;
  await tx`insert into run_read_audits(actor_user_id,admin_grant_id,action,run_id,result_count) values (${user.id},${admin.id},'detail','fixture-run',1)`;
  return { user, account, identity };
}

it.skipIf(!process.env.TEST_DATABASE_URL)(
  "compacted fresh install matches the full catalog and Drizzle rerun is a no-op",
  async () => {
    await rehearsal(async (tx, old, fresh) => {
      await replayMigrations(tx, old, "drizzle");
      const expected = await schemaCatalog(tx, old);
      await transition(tx, fresh);
      const migrations = readMigrationFiles({ migrationsFolder: candidate });
      const actual = await schemaCatalog(tx, fresh);
      expect(actual).toEqual(expected);
      expect(actual.tables).toHaveLength(25);
      expect(actual.functions).toHaveLength(5);
      expect(actual.triggers).toHaveLength(9);
      const before =
        await tx`select hash,created_at from __drizzle_migrations order by created_at,id`;
      expect(before.map((row) => row.hash)).toEqual(
        migrations.map((row) => row.hash)
      );
      expect(before).toHaveLength(1);
      await replayMigrations(tx, fresh, candidate);
      expect(
        await tx`select hash,created_at from __drizzle_migrations order by created_at,id`
      ).toEqual(before);
      // Catalog comparison must catch disabled guards, not merely table names.
      await tx`alter table runs disable trigger runs_owner_binding`;
      expect(await schemaCatalog(tx, fresh)).not.toEqual(expected);
      await expect(tx.savepoint((sp) => transition(sp, fresh))).rejects.toThrow(
        "compaction_schema_drift"
      );
    });
  },
  120_000
);

it.skipIf(!process.env.TEST_DATABASE_URL)(
  "upgrades populated0004 while preserving existing records and consent/admin transformations",
  async () => {
    await rehearsal(async (tx, old, fresh) => {
      const outputs: unknown[] = [];
      for (const [namespace, folder] of [
        [old, "drizzle"],
        [fresh, candidate],
      ]) {
        await replayMigrations(tx, namespace, "drizzle", 4);
        await seedLegacy(tx);
        const rowsBefore =
          await tx`select to_jsonb(w) as row from waitlist_signups w order by id`;
        const outboxBefore =
          await tx`select to_jsonb(e) as row from email_outbox e order by id`;
        const consentBefore =
          await tx`select to_jsonb(e) as row from consent_events e order by id`;
        const journalBefore =
          await tx`select hash,created_at from __drizzle_migrations order by created_at,id`;
        const retained = new Map<string, unknown>();
        for (const name of [
          "point_events",
          "attribution_touches",
          "sessions",
          "verification_tokens",
          "rate_limits",
        ])
          retained.set(
            name,
            await tx.unsafe(
              `select to_jsonb(t) as row from "${name}" t order by to_jsonb(t)::text`
            )
          );
        if (folder === candidate) await transition(tx, namespace);
        else await replayMigrations(tx, namespace, folder);
        for (const [name, rows] of retained)
          expect(
            await tx.unsafe(
              `select to_jsonb(t) as row from "${name}" t order by to_jsonb(t)::text`
            ),
            name
          ).toEqual(rows);
        expect(
          await tx`select to_jsonb(w)-'user_id'-'enrollment_source' as row from waitlist_signups w order by id`
        ).toEqual(rowsBefore);
        expect(
          await tx`select to_jsonb(e) as row from email_outbox e order by id`
        ).toEqual(outboxBefore);
        expect(
          await tx`select to_jsonb(e)-'subscription_id' as row from consent_events e order by id`
        ).toEqual(consentBefore);
        expect(
          (
            await tx`select hash,created_at from __drizzle_migrations order by created_at,id`
          ).slice(0, 5)
        ).toEqual(journalBefore);
        const admins =
          await tx`select signup_id,role,source from admin_role_grants order by signup_id`;
        const subscriptions =
          await tx`select normalized_email,purpose,status,source from email_subscriptions order by normalized_email`;
        expect(admins).toHaveLength(1);
        expect(subscriptions.map((row) => row.status)).toEqual([
          "subscribed",
          "unsubscribed",
          "unsubscribed",
        ]);
        expect(
          (await tx`select count(*)::int as n from access_grants`)[0].n
        ).toBe(0);
        expect(
          (
            await tx`select count(*)::int as n from consent_events where subscription_id is not null`
          )[0].n
        ).toBe(2);
        outputs.push({ admins, subscriptions });
        await replayMigrations(tx, namespace, folder);
        expect(
          (await tx`select count(*)::int as n from email_outbox`)[0].n
        ).toBe(1);
      }
      expect(outputs[1]).toEqual(outputs[0]);
    });
  },
  120_000
);

it.skipIf(!process.env.TEST_DATABASE_URL)(
  "rehearses append-only baseline adoption without executing DDL or changing existing data",
  async () => {
    await rehearsal(async (tx, old, fresh) => {
      await replayMigrations(tx, fresh, candidate);
      const expected = await schemaCatalog(tx, fresh);
      await replayMigrations(tx, old, "drizzle", 4);
      await seedLegacy(tx);
      await replayMigrations(tx, old, "drizzle");
      expect(await schemaCatalog(tx, old)).toEqual(expected);
      await seedCurrent(tx);
      // Exercise the real transition implementation, not a hand-written marker.
      const names = (
        await tx`select tablename from pg_tables where schemaname=${old} order by tablename`
      ).map((row) => String(row.tablename));
      const dataBefore = new Map<string, unknown>();
      for (const name of names)
        dataBefore.set(
          name,
          await tx.unsafe(
            `select to_jsonb(t) as row from "${name}" t order by to_jsonb(t)::text`
          )
        );
      const objectIds =
        await tx`select relname,oid,relacl::text from pg_class where relnamespace=${old}::regnamespace order by relname`;
      const legacy = readMigrationFiles({ migrationsFolder: "drizzle" });
      const ledger =
        await tx`select hash,created_at from __drizzle_migrations order by created_at,id`;
      expect(ledger.map((row) => row.hash)).toEqual(
        legacy.map((row) => row.hash)
      );
      const baseline = readMigrationFiles({ migrationsFolder: candidate }).at(
        -1
      )!;
      expect(baseline.folderMillis).toBeGreaterThan(
        legacy.at(-1)!.folderMillis
      );
      await transition(tx, old);
      await transition(tx, old);
      for (const name of names.filter(
        (name) => name !== "__drizzle_migrations"
      ))
        expect(
          await tx.unsafe(
            `select to_jsonb(t) as row from "${name}" t order by to_jsonb(t)::text`
          ),
          name
        ).toEqual(dataBefore.get(name));
      expect(
        await tx`select relname,oid,relacl::text from pg_class where relnamespace=${old}::regnamespace order by relname`
      ).toEqual(objectIds);
      expect(
        (
          await tx`select hash,created_at from __drizzle_migrations order by created_at,id`
        ).slice(0, 11)
      ).toEqual(ledger);
      expect(
        (await tx`select count(*)::int as n from __drizzle_migrations`)[0].n
      ).toBe(12);
      const next = {
        sql: [
          'CREATE TABLE "future_migration_probe" ("id" integer PRIMARY KEY)',
        ],
        bps: true,
        folderMillis: baseline.folderMillis + 1,
        hash: "synthetic-future-migration",
      };
      await replayMigrations(tx, old, candidate, Infinity, [next]);
      await replayMigrations(tx, old, candidate, Infinity, [next]);
      expect(
        (await tx`select count(*)::int as n from __drizzle_migrations`)[0].n
      ).toBe(13);
    });
  },
  120_000
);

it.skipIf(!process.env.TEST_DATABASE_URL)(
  "finishes an intermediate0008 database before recording the baseline",
  async () => {
    await rehearsal(async (tx, old, fresh) => {
      await replayMigrations(tx, old, "drizzle", 4);
      await seedLegacy(tx);
      await replayMigrations(tx, old, "drizzle", 8);
      const before =
        await tx`select to_jsonb(w) as row from waitlist_signups w order by id`;
      const result = await transition(tx, old);
      expect(result.previousEntries).toBe(9);
      expect(
        await tx`select to_jsonb(w) as row from waitlist_signups w order by id`
      ).toEqual(before);
      expect(
        (await tx`select count(*)::int n from __drizzle_migrations`)[0].n
      ).toBe(12);
      const actual = await schemaCatalog(tx, old);
      await replayMigrations(tx, fresh, candidate);
      expect(await schemaCatalog(tx, fresh)).toEqual(actual);
    });
  },
  120_000
);

it.skipIf(!process.env.TEST_DATABASE_URL)(
  "explicitly adopts the exact unjournaled asset scaffold without losing rows or accepting other drift",
  async () => {
    await rehearsal(async (tx, old, drift) => {
      for (const namespace of [old, drift]) {
        await replayMigrations(tx, namespace, "drizzle", 4);
        await seedLegacy(tx);
        for (const statement of readFileSync(
          "scripts/db/legacy-asset-scaffold.sql",
          "utf8"
        ).split("--> statement-breakpoint"))
          if (statement.trim()) await tx.unsafe(statement);
        await tx`insert into mcp_assets(id,principal_id,url,capability,gateway_request_id,provider_request_id) values ('preserved-asset','legacy-owner','https://example.invalid/preserve.png','image','legacy-gateway','legacy-provider')`;
        const before =
          await tx`select to_jsonb(a) as row from mcp_assets a order by id`;
        const [identity] =
          await tx`select oid,relacl::text from pg_class where oid='mcp_assets'::regclass`;
        if (namespace === drift) {
          await tx`alter table mcp_assets add column unexpected text`;
          await expect(
            tx.savepoint((sp) =>
              transitionToBaseline(sp, {
                schema: namespace,
                journalSchema: namespace,
                adoptLegacyAssetScaffold: true,
              })
            )
          ).rejects.toThrow("compaction_schema_drift");
          expect(
            (await tx`select count(*)::int n from __drizzle_migrations`)[0].n
          ).toBe(5);
          continue;
        }
        await expect(
          tx.savepoint((sp) => transition(sp, namespace))
        ).rejects.toThrow("compaction_schema_drift");
        await transitionToBaseline(tx, {
          schema: namespace,
          journalSchema: namespace,
          adoptLegacyAssetScaffold: true,
        });
        expect(
          await tx`select to_jsonb(a)-'run_id'-'media_type'-'available_until'-'expires_at'-'unavailable_at'-'hidden_at' as row from mcp_assets a order by id`
        ).toEqual(before);
        expect(
          (
            await tx`select oid,relacl::text from pg_class where oid='mcp_assets'::regclass`
          )[0]
        ).toEqual(identity);
        expect((await tx`select count(*)::int n from runs`)[0].n).toBe(0);
        expect(
          (await tx`select count(*)::int n from __drizzle_migrations`)[0].n
        ).toBe(12);
        await transition(tx, namespace);
        expect((await tx`select count(*)::int n from mcp_assets`)[0].n).toBe(1);
      }
    });
  },
  120_000
);

it.skipIf(!process.env.TEST_DATABASE_URL)(
  "compacted schema enforces audit immutability, identity mapping and asset ownership",
  async () => {
    await rehearsal(async (tx, _old, fresh) => {
      await replayMigrations(tx, fresh, "drizzle", 4);
      await seedLegacy(tx);
      await transition(tx, fresh);
      const { account, identity } = await seedCurrent(tx);
      for (const table of ["access_events", "run_events", "run_read_audits"]) {
        for (const statement of [
          `DELETE FROM "${table}"`,
          `UPDATE "${table}" SET id=id`,
          table === "access_events"
            ? 'TRUNCATE "access_events", "access_operation_items"'
            : `TRUNCATE "${table}"`,
        ]) {
          await expect(
            tx.savepoint((sp) => sp.unsafe(statement))
          ).rejects.toMatchObject({ code: "23514" });
        }
      }
      await expect(
        tx.savepoint(
          (sp) =>
            sp`update external_accounts set external_user_id='changed' where id=${account.id}`
        )
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        tx.savepoint(
          (sp) =>
            sp`update auth_identities set external_user_id='changed' where id=${identity.id}`
        )
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        tx.savepoint(
          (sp) =>
            sp`update runs set gateway_request_id='changed' where id='fixture-run'`
        )
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        tx.savepoint(
          (sp) =>
            sp`update runs set principal_id='other' where id='fixture-run'`
        )
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        tx.savepoint(
          (sp) =>
            sp`update mcp_assets set principal_id='other' where id='fixture-media'`
        )
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        tx.savepoint(
          (sp) =>
            sp`insert into run_events(run_id,event_key,status) values ('fixture-run','result','succeeded')`
        )
      ).rejects.toMatchObject({ code: "23505" });
      await expect(
        tx.savepoint(
          (sp) => sp`update runs set completed_at=null where id='fixture-run'`
        )
      ).rejects.toMatchObject({ code: "23514" });
    });
  },
  120_000
);
