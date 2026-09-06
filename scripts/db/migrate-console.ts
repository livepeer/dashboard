/** Normal migration entry point: explicit target, atomic transition, no app startup DDL. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { transitionToBaseline } from "./compact-migrations";

export function consoleMigrationTarget(
  env: Record<string, string | undefined>
) {
  const value = env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL;
  if (!value || !env.MIGRATION_EXPECTED_HOST)
    throw Error("compaction_explicit_target_required");
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== env.MIGRATION_EXPECTED_HOST ||
    !url.pathname ||
    url.pathname === "/" ||
    [...url.searchParams.keys()].some(
      (k) => !["sslmode", "channel_binding"].includes(k)
    )
  )
    throw Error("compaction_target_mismatch");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && env.MIGRATION_EXPECTED_DATABASE !== url.pathname.slice(1))
    throw Error("compaction_explicit_database_required");
  return { url: value, local };
}

export async function migrateConsole(
  env: Record<string, string | undefined>,
  check = false
) {
  const { url, local } = consoleMigrationTarget(env);
  const client = postgres(url, {
    max: 1,
    prepare: false,
    ssl: local ? undefined : "require",
    connect_timeout: 10,
    connection: { statement_timeout: 30_000, lock_timeout: 10_000 },
  });
  const rollback = Error("compaction_check_rollback");
  let result: Awaited<ReturnType<typeof transitionToBaseline>> | undefined;
  try {
    await client
      .begin(async (tx) => {
        await tx`SET LOCAL client_min_messages = warning`;
        result = await transitionToBaseline(tx, {
          schema: "public",
          journalSchema: "drizzle",
        });
        if (check) throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
    return { mode: check ? "rollback_rehearsal" : "applied", ...result };
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  migrateConsole(process.env, process.argv.includes("--check"))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      // Never print driver queries, credentials or submitted application data.
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
