/** Historical 0009→0010 rollout only. After baseline adoption use scripts/db/migrate.ts.
 * Explicitly guarded, additive preview-only migration. Defaults to read-only rehearsal. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const PREVIEW_BRANCH = "br-holy-sound-auugm104";
const PREVIEW_HOST =
  "ep-dry-smoke-au7l7dzw-pooler.c-10.us-east-1.aws.neon.tech";
const RUNTIME_ROLE = "console_early_access_runtime_20260904";
const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
type Environment = Record<string, string | undefined>;

export function assertRunMigrationTarget(env: Environment): {
  ownerUrl: string;
  runtimeUrl?: string;
} {
  if (env.PREVIEW_RUNS_BRANCH_ID !== PREVIEW_BRANCH)
    throw new Error("preview_runs_branch_guard_failed");
  const check = (value: string | undefined) => {
    if (!value) throw new Error("preview_runs_database_url_required");
    const url = new URL(value);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== PREVIEW_HOST ||
      url.pathname !== "/neondb" ||
      [...url.searchParams.keys()].some(
        (key) => !["sslmode", "channel_binding"].includes(key)
      )
    )
      throw new Error("preview_runs_host_guard_failed");
    return value;
  };
  return {
    ownerUrl: check(env.PREVIEW_RUNS_DATABASE_URL),
    runtimeUrl: env.PREVIEW_RUNS_RUNTIME_DATABASE_URL
      ? check(env.PREVIEW_RUNS_RUNTIME_DATABASE_URL)
      : undefined,
  };
}

export async function migratePreviewRuns(env: Environment, apply = false) {
  const { ownerUrl, runtimeUrl } = assertRunMigrationTarget(env);
  if (apply && !runtimeUrl)
    throw new Error("preview_runs_runtime_verification_url_required");
  if (apply && runtimeUrl) {
    const runtime = postgres(runtimeUrl, {
      max: 1,
      prepare: false,
      connect_timeout: 10,
      ssl: "require",
    });
    try {
      const [probe] =
        await runtime`select current_user role, has_schema_privilege(current_user,'public','CREATE') ddl`;
      if (probe.role !== RUNTIME_ROLE || probe.ddl)
        throw new Error("preview_runs_runtime_probe_failed");
    } finally {
      await runtime.end();
    }
  }
  const journal = JSON.parse(
    readFileSync(resolve(ROOT, "drizzle/meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; when: number; tag: string }[] };
  if (
    journal.entries.length !== 11 ||
    journal.entries[10].tag !== "0010_run_records"
  )
    throw new Error("preview_runs_manifest_guard_failed");
  const manifest = journal.entries.map((entry) => {
    const source = readFileSync(
      resolve(ROOT, `drizzle/${entry.tag}.sql`),
      "utf8"
    );
    return {
      ...entry,
      source,
      hash: createHash("sha256").update(source).digest("hex"),
    };
  });
  const client = postgres(ownerUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    ssl: "require",
  });
  try {
    const result = await client.begin(async (tx) => {
      if (apply)
        await tx`select pg_advisory_xact_lock(hashtextextended('console-preview-0010-run-records',0))`;
      const applied = await tx<
        { hash: string; created_at: string }[]
      >`select hash,created_at from drizzle.__drizzle_migrations order by created_at,id`;
      if (![10, 11].includes(applied.length))
        throw new Error("preview_runs_applied_count_mismatch");
      for (let index = 0; index < applied.length; index++) {
        if (
          applied[index].hash !== manifest[index].hash ||
          Number(applied[index].created_at) !== manifest[index].when
        )
          throw new Error(`preview_runs_applied_hash_mismatch_${index}`);
      }
      const counts = async () => {
        const [row] =
          await tx`select (select count(*)::int from users) users, (select count(*)::int from waitlist_signups) signups, (select count(*)::int from admin_role_grants) admin_grants, (select count(*)::int from access_grants) access_grants, (select count(*)::int from consent_events) consents, (select count(*)::int from email_outbox) outbox, (select count(*)::int from mcp_assets) assets`;
        return row;
      };
      const before = await counts();
      if (!apply)
        return {
          mode: "dry_run",
          pending: applied.length === 10,
          branchId: PREVIEW_BRANCH,
          preservedCounts: before,
          migrationHash: manifest[10].hash,
        };
      if (applied.length === 10) {
        for (const statement of manifest[10].source.split(
          "--> statement-breakpoint"
        ))
          if (statement.trim()) await tx.unsafe(statement);
        await tx`insert into drizzle.__drizzle_migrations(hash,created_at) values(${manifest[10].hash},${manifest[10].when})`;
      }
      // New execution data is updateable; lifecycle/read audits are append-only.
      await tx.unsafe(
        `GRANT SELECT, INSERT, UPDATE ON runs, run_reconciliation_jobs TO "${RUNTIME_ROLE}"`
      );
      await tx.unsafe(
        `GRANT SELECT, INSERT ON run_events, run_read_audits TO "${RUNTIME_ROLE}"`
      );
      await tx.unsafe(
        `REVOKE DELETE, TRUNCATE ON runs, run_reconciliation_jobs, run_events, run_read_audits FROM "${RUNTIME_ROLE}"`
      );
      await tx.unsafe(
        `REVOKE UPDATE ON run_events, run_read_audits FROM "${RUNTIME_ROLE}"`
      );
      const [permissions] =
        await tx`select has_schema_privilege(${RUNTIME_ROLE},'public','CREATE') ddl,
        (has_table_privilege(${RUNTIME_ROLE},'runs','SELECT') and has_table_privilege(${RUNTIME_ROLE},'runs','INSERT') and has_table_privilege(${RUNTIME_ROLE},'runs','UPDATE')) run_write,
        (has_table_privilege(${RUNTIME_ROLE},'run_reconciliation_jobs','SELECT') and has_table_privilege(${RUNTIME_ROLE},'run_reconciliation_jobs','INSERT') and has_table_privilege(${RUNTIME_ROLE},'run_reconciliation_jobs','UPDATE')) recovery_write,
        (has_table_privilege(${RUNTIME_ROLE},'run_events','SELECT') and has_table_privilege(${RUNTIME_ROLE},'run_events','INSERT')) event_append,
        (has_table_privilege(${RUNTIME_ROLE},'run_read_audits','SELECT') and has_table_privilege(${RUNTIME_ROLE},'run_read_audits','INSERT')) audit_append,
        has_table_privilege(${RUNTIME_ROLE},'run_events','UPDATE') event_update, has_table_privilege(${RUNTIME_ROLE},'run_events','DELETE') event_delete, has_table_privilege(${RUNTIME_ROLE},'run_read_audits','UPDATE') audit_update, has_table_privilege(${RUNTIME_ROLE},'run_read_audits','DELETE') audit_delete`;
      if (
        permissions.ddl ||
        !permissions.run_write ||
        !permissions.recovery_write ||
        !permissions.event_append ||
        !permissions.audit_append ||
        permissions.event_update ||
        permissions.event_delete ||
        permissions.audit_update ||
        permissions.audit_delete
      )
        throw new Error("preview_runs_permission_guard_failed");
      const triggers =
        await tx`select tgname from pg_trigger where not tgisinternal and tgrelid in ('public.runs'::regclass,'public.run_events'::regclass,'public.run_read_audits'::regclass) and tgname in ('run_events_immutable','run_events_immutable_truncate','run_read_audits_immutable','run_read_audits_immutable_truncate','runs_owner_binding')`;
      if (triggers.length !== 5)
        throw new Error("preview_runs_immutability_guard_failed");
      const after = await counts();
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error("preview_runs_existing_counts_changed");
      return {
        mode: "apply",
        applied: applied.length === 10,
        branchId: PREVIEW_BRANCH,
        preservedCounts: after,
        migrationHash: manifest[10].hash,
        permissions,
      };
    });
    if (apply && runtimeUrl) {
      const runtime = postgres(runtimeUrl, {
        max: 1,
        prepare: false,
        connect_timeout: 10,
        ssl: "require",
      });
      try {
        const [probe] =
          await runtime`select current_user role, has_schema_privilege(current_user,'public','CREATE') ddl, (select count(*)::int from runs) runs, (select count(*)::int from run_events) events, (select count(*)::int from run_read_audits) audits`;
        if (probe.role !== RUNTIME_ROLE || probe.ddl)
          throw new Error("preview_runs_runtime_probe_failed");
      } finally {
        await runtime.end();
      }
    }
    return result;
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  migratePreviewRuns(process.env, process.argv.includes("--apply"))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      // Never log a driver error, query parameters, credentials or connection string.
      console.error(
        JSON.stringify({
          error:
            error instanceof Error && /^preview_runs_/.test(error.message)
              ? error.message
              : "preview_runs_migration_failed",
        })
      );
      process.exitCode = 1;
    });
}
