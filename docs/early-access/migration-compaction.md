# Consolidated Console migration baseline

## Outcome

The active generation folder is `drizzle-baseline/`: one migration,
`0000_console_baseline.sql`, containing the final 25-table schema, five custom
functions and nine application triggers. Its snapshot is structurally equivalent
to the original `0010` snapshot.

The original `drizzle/` files remain byte-for-byte unchanged as **immutable upgrade
evidence**, not the active generation target. Do not delete them: an existing
database may still need their original data transformations. Keeping this archive
does not make a fresh install run eleven migrations.

The earlier six-file candidate has been superseded and removed.

## Existing database evidence

- Production waitlist: the September 4 audit recorded 65 signups and migration
  journal entries through `0004`. This is historical evidence, not a fresh
  production inventory. Production has not been queried or changed for this work.
- Isolated preview `br-holy-sound-auugm104`: inspected through `0010`; the full
  baseline transition was rehearsed successfully in a transaction that rolled back.
- Disposable integration `br-super-bird-auln2med`: shared schema through `0008`.
  Tests use independent synthetic schemas, not its existing application records.

No separate application migration runner or additional dependent database has been
established. Do not turn that uncertainty into a requirement for John to perform
the engineering verification.

## How each path works

| Starting state | Baseline-aware runner |
| --- | --- |
| Empty application schema, no journal | Verify it is empty; execute the single baseline. |
| Exact original journal prefix, including populated `0000–0004` | Verify its schema against that prefix; execute only missing original migrations; verify the final schema; append the baseline marker. |
| Exact original chain through `0010` | Verify the schema; append the baseline marker without executing application DDL. |
| Baseline already recorded | Verify the applied schema and execute only subsequent migrations. |
| Changed hashes, missing entries, unexpected schema or unknown journal | Stop and roll back. Never guess or reset. |

The original journal is retained. A database with eleven original journal entries
has twelve immediately after adoption: eleven old entries plus the baseline
marker. A fresh database has one. Both use the same subsequent migration chain.

The entire transition and reference-schema verification occur in one transaction.
Reference schemas are created only within savepoints and rolled back; no supplied
application schema is dropped. The runner uses a shared advisory lock and locks
an existing migration journal. Coordinate a pause for older/raw migration runners,
which do not necessarily participate in the same lock.

Schema comparison includes columns/defaults, indexes, foreign keys, checks, enums,
function bodies, enabled triggers and row policies. Environment-specific ACLs are
not treated as structural drift; existing permissions are not reset or broadened.
Runtime grant provisioning remains a separate rollout responsibility.

## Commands and development continuity

- `pnpm db:generate` generates subsequent migrations into `drizzle-baseline/`.
- `pnpm db:migrate --check` rehearses the complete transition and rolls back.
- `pnpm db:migrate` commits the verified transition and pending migrations.
- Never run raw `drizzle-kit migrate` against an original-chain database. It does
  not perform the transition and would try to recreate existing objects.
- The older `scripts/runs/migrate-preview.ts` is a historical `0009 → 0010`
  rollout tool; do not use it after baseline adoption.

Supply an owner connection through the process environment:
`MIGRATION_DATABASE_URL` (or `DATABASE_URL`), plus
`MIGRATION_EXPECTED_HOST`. Remote targets also require
`MIGRATION_EXPECTED_DATABASE`. Host/database values must match the URL exactly;
connection target override query parameters are rejected. The command does not
automatically load an environment file. Keep credentials in ignored files and
load them without printing them.

There is no migration step in the Vercel build or application startup. Migrations
must precede code deployment when that code needs new database objects.
A code merge does not itself execute a production migration.

For the existing isolated preview, `scripts/db/migrate.ts` is a stricter wrapper:
it only permits that preview, checks the existing runtime role's run/audit
privileges, defaults to rollback, and requires `--apply`,
`MIGRATION_APPROVED_BRANCH` and `MIGRATION_APPROVED_BASELINE_HASH` to commit.
It rejects fresh/partially provisioned environments rather than guessing grants.

## Production rollout boundary

Production signups must survive. Before an explicitly authorized production
rollout, obtain a current journal/schema inventory, verify a recoverable backup,
pause competing migration runners, and rehearse with `--check`. If production
still matches `0004`, the tested original data transformations are the upgrade
path; do not simply mark the baseline satisfied.

Check least-privilege runtime access to newly created tables before deploying
readers/writers. Do not grant runtime schema creation or audit UPDATE/DELETE/
TRUNCATE. No automatic canonical-user backfill, media archival or paid inference
is included.

## Verification

The database tests compare fresh original and consolidated catalogs, test populated
`0004` upgrades, and exercise actual adoption code rather than hand-written journal
markers. They verify:

- Signups, referral relationships/points, consent evidence, queued email,
  attribution, sessions, verification tokens and rate-limit records are preserved.
- Original admin/consent transformations are retained; access approval is not
  invented.
- Submitted arguments, results, hidden/unavailable asset references, lifecycle
  events and read audits survive adoption.
- Already-upgraded object IDs, application rows, ACLs and old journal entries stay
  unchanged.
- Repeated migration is a no-op; subsequent migrations execute once.
- Schema drift and journal tampering fail closed.
- Audit mutation, cross-owner asset links and identity/run owner mutation fail.

The run-store, execution, asset, preview-fixture and real multi-connection race
tests now initialize from the consolidated baseline. Historical upgrade tests
intentionally retain the original chain.

Live MCP installation/authentication remains a separate existing verification gap,
not a migration-compaction requirement to delegate to John.

### Recorded results — September 6, 2026

- Five full-baseline database rehearsals passed, including fresh install,
  populated `0004`, intermediate `0008`, already-upgraded adoption, and guards.
- Fifteen run/asset/execution/seed/historical-upgrade integration tests passed.
- Five real multi-connection concurrency tests passed against the new baseline.
- Isolated preview adoption and runtime-permission verification passed in a
  rollback-only transaction; the preview has not committed a baseline marker.
- General suite: 391 passed, 48 environment-gated tests skipped in that command.
  The database suites above were run separately with their explicit guards.
- Console/MCP suite: 138 passed. Typecheck, full lint and production build passed.
  Build output retained existing workspace-root/Auth0 configuration warnings;
  a successful build does not establish live MCP authentication.
- Original migration SQL is unchanged. No production access, production migration,
  commit, push or deployment was performed as part of this compaction work.
