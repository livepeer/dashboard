/** Guarded preview rollout. Defaults to a complete rehearsal followed by rollback. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { transitionToBaseline } from "./compact-migrations";

const targets: Record<string, string> = {
  "br-holy-sound-auugm104":
    "ep-dry-smoke-au7l7dzw-pooler.c-10.us-east-1.aws.neon.tech",
};
export function migrationTarget(
  env: Record<string, string | undefined>,
  apply = false
) {
  const branch = env.MIGRATION_BRANCH_ID ?? "";
  const host = targets[branch];
  if (!host || !env.MIGRATION_DATABASE_URL)
    throw Error("compaction_target_not_approved");
  const url = new URL(env.MIGRATION_DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== host ||
    url.pathname !== "/neondb" ||
    [...url.searchParams.keys()].some(
      (k) => !["sslmode", "channel_binding"].includes(k)
    )
  )
    throw Error("compaction_target_mismatch");
  if (
    apply &&
    (env.MIGRATION_APPROVED_BRANCH !== branch ||
      !env.MIGRATION_APPROVED_BASELINE_HASH)
  )
    throw Error("compaction_explicit_apply_approval_required");
  return { branch, url: env.MIGRATION_DATABASE_URL };
}

export async function migrate(
  env: Record<string, string | undefined>,
  apply = false
) {
  const target = migrationTarget(env, apply);
  const client = postgres(target.url, {
    max: 1,
    prepare: false,
    ssl: "require",
    connect_timeout: 10,
    connection: { statement_timeout: 30_000, lock_timeout: 10_000 },
  });
  const rollback = Error("compaction_rehearsal_complete");
  let result: Awaited<ReturnType<typeof transitionToBaseline>> | undefined;
  try {
    await client
      .begin(async (tx) => {
        await tx`SET LOCAL client_min_messages = warning`;
        result = await transitionToBaseline(tx, {
          schema: "public",
          journalSchema: "drizzle",
        });
        if (
          apply &&
          result.baselineHash !== env.MIGRATION_APPROVED_BASELINE_HASH
        )
          throw Error("compaction_approved_hash_mismatch");
        // This entry point is specifically for adopting the already-provisioned
        // preview. Fresh/partial environments require their own grant provisioning.
        if (
          !["legacy", "adopted", "baseline"].includes(result.previousState) ||
          (result.previousState === "legacy" && result.previousEntries !== 11)
        )
          throw Error("compaction_preview_requires_existing_run_schema");
        const role = "console_early_access_runtime_20260904";
        const [privileges] =
          await tx`select has_schema_privilege(${role},'public','CREATE') ddl,
        (has_table_privilege(${role},'runs','SELECT') and has_table_privilege(${role},'runs','INSERT') and has_table_privilege(${role},'runs','UPDATE')) runs,
        (has_table_privilege(${role},'run_reconciliation_jobs','SELECT') and has_table_privilege(${role},'run_reconciliation_jobs','INSERT') and has_table_privilege(${role},'run_reconciliation_jobs','UPDATE')) recovery,
        (has_table_privilege(${role},'run_events','SELECT') and has_table_privilege(${role},'run_events','INSERT')) events,
        (has_table_privilege(${role},'run_read_audits','SELECT') and has_table_privilege(${role},'run_read_audits','INSERT')) audits,
        has_table_privilege(${role},'run_events','UPDATE,DELETE,TRUNCATE') mutable_events,
        has_table_privilege(${role},'run_read_audits','UPDATE,DELETE,TRUNCATE') mutable_audits`;
        if (
          privileges.ddl ||
          !privileges.runs ||
          !privileges.recovery ||
          !privileges.events ||
          !privileges.audits ||
          privileges.mutable_events ||
          privileges.mutable_audits
        )
          throw Error("compaction_runtime_privileges_mismatch");
        if (!apply) throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
    return {
      mode: apply ? "apply" : "rollback_rehearsal",
      branch: target.branch,
      ...result,
    };
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  migrate(process.env, process.argv.includes("--apply"))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(
        JSON.stringify({
          error:
            error instanceof Error && /^compaction_[a-z_]+$/.test(error.message)
              ? error.message
              : "compaction_failed",
        })
      );
      process.exitCode = 1;
    });
}
