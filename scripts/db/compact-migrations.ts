import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import type postgres from "postgres";
import { replayMigrations, schemaCatalog } from "./migration-support";

type Entry = { hash: string; created_at: string | number };
const matches = (row: Entry, migration: MigrationMeta) =>
  row.hash === migration.hash &&
  Number(row.created_at) === migration.folderMillis;

/** Fail closed on missing, reordered, changed or unknown migration evidence. */
export function classifyJournal(
  rows: Entry[],
  legacy: MigrationMeta[],
  active: MigrationMeta[]
) {
  if (!rows.length) return { kind: "fresh" as const, applied: 0 };
  if (matches(rows[0], active[0])) {
    if (
      rows.length > active.length ||
      rows.some((r, i) => !matches(r, active[i]))
    )
      throw Error("compaction_unknown_active_journal");
    return { kind: "baseline" as const, applied: rows.length };
  }
  const old = rows.slice(0, legacy.length);
  if (old.some((r, i) => !matches(r, legacy[i])))
    throw Error("compaction_unknown_legacy_journal");
  if (rows.length <= legacy.length)
    return { kind: "legacy" as const, applied: rows.length };
  const tail = rows.slice(legacy.length);
  if (
    tail.length > active.length ||
    tail.some((r, i) => !matches(r, active[i]))
  )
    throw Error("compaction_unknown_adoption_journal");
  return { kind: "adopted" as const, applied: tail.length };
}

// Environment-specific grants are not supplied by Drizzle. Compare structural
// equivalence independently; the upgrade never resets existing grants.
function structure(catalog: Record<string, unknown[]>) {
  return JSON.stringify(catalog, (key, value) =>
    key === "acl" ? undefined : value
  );
}

/** Caller owns the transaction, target authorization, runtime grants and commit.
 * No network connection or production target is embedded in this module.
 */
export async function transitionToBaseline(
  tx: postgres.TransactionSql,
  options: {
    schema: string;
    journalSchema: string;
    legacyFolder?: string;
    activeFolder?: string;
    adoptLegacyAssetScaffold?: boolean;
  }
) {
  const {
    schema,
    journalSchema,
    legacyFolder = "drizzle",
    activeFolder = "drizzle-baseline",
  } = options;
  if (![schema, journalSchema].every((s) => /^[a-z_][a-z0-9_]*$/.test(s)))
    throw Error("compaction_invalid_schema");
  const legacy = readMigrationFiles({ migrationsFolder: legacyFolder });
  const active = readMigrationFiles({ migrationsFolder: activeFolder });
  const manifest = JSON.parse(
    readFileSync(`${activeFolder}/source-manifest.json`, "utf8")
  );
  if (
    active.some(
      (migration, index) =>
        index > 0 && migration.folderMillis <= active[index - 1].folderMillis
    )
  )
    throw Error("compaction_nonmonotonic_active_journal");
  if (
    legacy.length !== manifest.sourceMigrations.length ||
    legacy.some(
      (m, i) =>
        m.hash !== manifest.sourceMigrations[i].sha256 ||
        m.folderMillis !== manifest.sourceMigrations[i].when
    ) ||
    active[0]?.hash !== manifest.candidateMigration.sha256 ||
    active[0]?.folderMillis !== manifest.candidateMigration.when ||
    active[0].folderMillis <= legacy.at(-1)!.folderMillis
  )
    throw Error("compaction_manifest_mismatch");
  await tx`select pg_advisory_xact_lock(hashtextextended('console-schema-migrations',0))`;
  const [exists] =
    await tx`select to_regclass(${`${journalSchema}.__drizzle_migrations`}) as journal`;
  if (exists.journal)
    await tx.unsafe(
      `LOCK TABLE "${journalSchema}".__drizzle_migrations IN ACCESS EXCLUSIVE MODE`
    );
  const rows = exists.journal
    ? await tx.unsafe<Entry[]>(
        `select hash,created_at from "${journalSchema}".__drizzle_migrations order by created_at,id`
      )
    : [];
  const plan = classifyJournal(rows, legacy, active);

  // Reference schemas and their DDL disappear via savepoint rollback, even on
  // successful verification. Never DROP a supplied schema or touch its records.
  async function verify(
    folder?: string,
    last = Infinity,
    assetScaffold = false
  ) {
    let expected: Record<string, unknown[]> | undefined;
    const rollback = Error("compaction_reference_rollback");
    await tx
      .savepoint(async (sp) => {
        const reference = `compact_${randomUUID().replaceAll("-", "")}`;
        await sp.unsafe(`CREATE SCHEMA "${reference}"`);
        if (folder) await replayMigrations(sp, reference, folder, last);
        if (assetScaffold) {
          for (const statement of readFileSync(
            "scripts/db/legacy-asset-scaffold.sql",
            "utf8"
          ).split("--> statement-breakpoint"))
            if (statement.trim()) await sp.unsafe(statement);
        }
        expected = await schemaCatalog(sp, reference);
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
    if (structure(await schemaCatalog(tx, schema)) !== structure(expected!))
      throw Error("compaction_schema_drift");
  }

  if (plan.kind === "fresh") {
    await verify(); // Never baseline an unjournaled populated schema.
  } else if (plan.kind === "legacy") {
    let scaffold = false;
    try {
      await verify(legacyFolder, plan.applied - 1);
    } catch (error) {
      if (
        !options.adoptLegacyAssetScaffold ||
        plan.applied < 5 ||
        plan.applied > 9 ||
        !(error instanceof Error) ||
        error.message !== "compaction_schema_drift"
      )
        throw error;
      // Opt-in supports only the exact observed scaffold, not arbitrary drift.
      await verify(legacyFolder, plan.applied - 1, true);
      scaffold = true;
    }
    if (scaffold) {
      await replayMigrations(tx, schema, legacyFolder, 8, [], journalSchema);
      // Add the owner-scoped guard before removing the older global constraint.
      // No row or table is dropped; table identity and grants stay intact.
      await tx.unsafe(
        'CREATE UNIQUE INDEX "mcp_assets_principal_job_url_unique" ON "mcp_assets" ("principal_id", "gateway_request_id", "url")'
      );
      await tx.unsafe(
        'ALTER TABLE "mcp_assets" DROP CONSTRAINT "mcp_assets_job_url_unique"'
      );
      await tx.unsafe('DROP INDEX "mcp_assets_principal_created_idx"');
      await tx.unsafe(
        'CREATE INDEX "mcp_assets_principal_created_idx" ON "mcp_assets" ("principal_id", "created_at" DESC NULLS LAST)'
      );
      // Only record 0009 after its complete effective schema is established.
      await verify(legacyFolder, 9);
      await tx.unsafe(
        `insert into "${journalSchema}".__drizzle_migrations(hash,created_at) values ($1,$2)`,
        [legacy[9].hash, legacy[9].folderMillis]
      );
    }
    await replayMigrations(
      tx,
      schema,
      legacyFolder,
      Infinity,
      [],
      journalSchema
    );
    await verify(activeFolder, 0);
    await tx.unsafe(
      `insert into "${journalSchema}".__drizzle_migrations(hash,created_at) values ($1,$2)`,
      [active[0].hash, active[0].folderMillis]
    );
  } else {
    await verify(activeFolder, plan.applied - 1);
  }
  await replayMigrations(tx, schema, activeFolder, Infinity, [], journalSchema);
  await verify(activeFolder);
  return {
    previousState: plan.kind,
    previousEntries: rows.length,
    baselineHash: active[0].hash,
  };
}
