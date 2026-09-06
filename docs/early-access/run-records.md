# Durable run records and temporary media

Status: implemented locally; additive `0010_run_records` applied to isolated
preview `br-holy-sound-auugm104` on 2026-09-06. Code has not been pushed or deployed.
John's migrations `0000`–`0009` remain unchanged. Other environments must apply
the reviewed migration before deploying readers/writers of these columns.
Production rollout and hosted recovery scheduling are not part of this change.

## Bird's-eye schema

| Area                | Tables                                                                                               | Responsibility                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Identity            | `users`, `auth_identities`, `user_emails`                                                            | Canonical accounts, authentication identities, verified addresses           |
| External accounts   | `external_accounts`, `identity_external_accounts`                                                    | Scoped PymtHouse ownership bindings                                         |
| Waitlist/referrals  | `waitlist_signups`, `verification_tokens`, `sessions`, `point_events`, `attribution_touches`         | Enrollment, verification, referral credit and attribution                   |
| Consent/delivery    | `email_subscriptions`, `consent_events`, `email_outbox`                                              | Subscription authority, consent evidence and queued delivery                |
| Access/admin        | `access_grants`, `access_operations`, `access_operation_items`, `access_events`, `admin_role_grants` | Product admission, administration and immutable audit                       |
| Security            | `rate_limits`, `oauth_code_redemptions`                                                              | Abuse and OAuth replay protection                                           |
| Execution           | `runs`, `run_events`                                                                                 | Submitted arguments, structured outcomes and append-only lifecycle evidence |
| Recovery/read audit | `run_reconciliation_jobs`, `run_read_audits`                                                         | Leased outcome recovery and append-only administrative read audit           |
| Output references   | `mcp_assets`                                                                                         | Owned media URLs linked to runs; files remain with providers                |

```text
Authenticated principal → canonical user + scoped external account
                                  ↓
Submitted MCP JSON → runs → run_events
                      ├──→ run_reconciliation_jobs → public provider GETs
                      └──→ mcp_assets → provider-hosted temporary files
                                  ↓
                  Shared Home/Admin history and detail drawer

PymtHouse billing → cost/legacy usage-only records, not proof of run success
```

## Existing submission contract

The `run_capability` registration in `lib/mcp/mcp-server.ts` already accepts:

```json
{
  "capability": "provider/model",
  "inputs": { "prompt": "A lighthouse", "seed": 42 },
  "prompt": "Optional separate prompt",
  "endpoint": "Optional persistent-app route"
}
```

`submitted_arguments` is the complete validated tool argument object above,
captured before the gateway reshapes `inputs` into `params`. Preserve nested
values and optional-field presence; do not replace it with a prompt summary.
Null means not captured. Empty JSON means an actually empty captured object.
Do not store the JSON-RPC envelope, authentication headers, signer tokens, or
credentials embedded in argument objects. Capture version 1 redacts recognized
credential keys and signed-URL credentials and omits embedded file data. JSON
pointer paths identify redactions/omissions. This deterministic policy cannot
promise to recognize arbitrary secrets in prose. Submitted JSON over 1 MiB or
depth 32 is rejected before dispatch, even under keys that would be redacted.
Original arguments, not their sanitized copy, are sent to the provider.

Prompt data is private: user reads require the exact canonical user, configured
external-account scope and principal binding. Admin reads recheck authority and
append audit evidence before returning data. List responses omit full payloads;
only authorized details include them. Audit rows do not copy private payloads or
search text.

## Model

- `runs`: one execution attempt, stable ID, authenticated principal, required
  canonical user and scoped external account, gateway/provider IDs, source,
  capability/model/endpoint, submitted arguments, structured result envelope,
  redacted error, status and timestamps. Results support objects, arrays, text,
  scalars and null. Over-limit results get an explicit omission envelope without
  changing the observed execution outcome.
- `run_events`: append-only lifecycle evidence, with per-run idempotency keys.
- `run_reconciliation_jobs`: leased public-queue observations and bounded retries.
- `run_read_audits`: append-only administrative list/detail access evidence.
- `mcp_assets`: zero or more persistent media references for a run. Existing
  references retain null `run_id`; no historical run success or input is invented.
  A composite foreign key enforces matching run ID, principal and gateway ID.
- `available_until`: end of a known minimum media availability period, if supplied.
  `expires_at`: exact provider expiry only when known. `unavailable_at`: observed
  media unavailability. All are optional; none expire a run or delete its URL.
- `hidden_at`: hides an asset from agent discovery after `forget_assets`; its
  reference remains available in the run's historical record.

Successful text-only runs and failed runs do not need assets. Multiple output
URLs may link to the same run. A retry is a new execution attempt with a new
gateway ID; duplicate delivery of the same attempt must be idempotent. Status
`unknown` means reconciliation is needed (for example, the local poller timed
out but the provider might still complete). It is not proof of provider failure.
Terminal statuses require completion time. Store transitions lock the run row,
support expected-version checks, preserve terminal outcomes and deduplicate event
keys. Terminal state, result, output links and event commit in one transaction.

No automatic retention/deletion job is introduced. Required ownership foreign keys
prevent accidentally cascading away history. Account erasure of private payloads
and principal identifiers still requires a separate explicit policy. Forgetting
an asset is not erasing an execution record.

## Execution and recovery

The queued run is persisted before spend checks and discovery. Failure of that
initial write prevents dispatch; preflight rejection records failure. Signer
refresh inside an attempt stays on the same run. Persistence retries never invoke
inference again. Failed terminal recording returns the actual outcome with an
explicit persistence warning.

Timeouts and disconnected requests are unknown, not proven failure/cancellation.
Recovery accepts only public HTTPS `queue.fal.run` status/result pairs with no
credentials, query, fragment or alternate port. It never follows redirects,
cancels requests or dispatches inference. Reads have a 10-second timeout and 1 MiB
limit. Leased jobs use bounded backoff and a 24-hour horizon. Unrecoverable runs
remain visible with a reason.

Progress receipts wait until 15 minutes after run creation before worker recovery
can begin, allowing the 13-minute SDK attempt to finish. A final receipt wakes
the job immediately. Changed/unsupported handles invalidate or retire older
leases, and worker transitions check their lease under the run lock. The worker
also marks stale queued/running observations unknown after 15 minutes; missing
queue receipts remain explicitly unrecoverable, not falsely failed.

The operator-invoked one-shot worker is `scripts/runs/reconcile.ts`. It requires
explicit `RUN_RECONCILE_DATABASE_URL`, the approved preview branch in
`RUN_RECONCILE_BRANCH_ID`, and
`RUN_RECONCILE_ACK=public-provider-reads-only`. Supply credentials via an ignored
environment file, not command-line arguments. Use the repository toolchain and
Node flags `--conditions=react-server --import tsx`. It does not schedule itself.

Home reads saved runs with independent loading/error states and keyset pagination.
The older PymtHouse feed remains a separately continued usage-only group,
deduplicated against owned gateway IDs; billing events do not prove successful
execution. Admin uses the same presentation/detail components, with user-email
search and status filters.

Owned billing receipts are appended idempotently to run events with numeric fee
fields only. The detail drawer labels these **Observed usage**, not a guaranteed
final bill. Correlation occurs as the personal upstream feed is read; it is not
an automatic platform billing backfill. Saved runs remain readable when billing
is unavailable. Client history state is scoped to the authenticated account.

## Media presentation

fal-hosted media gets a notice on the media preview itself: it may become
unavailable after seven days; download to keep. There is no countdown presented
as a guaranteed deletion date and no date-based hiding of a usable URL. Other
providers do not inherit fal's policy. Explicit per-request lifecycle settings
must override this default once that metadata is collected. Source:
https://fal.ai/docs/documentation/model-apis/faq

Do not manufacture a new minimum-availability guarantee when recovering an older
output: leave `available_until` null without a reliable generation timestamp.

## Verification and rollout boundaries

`tests/contracts/run-security.test.ts` independently exercises nested capture,
credential and embedded-media redaction, byte/depth limits, scalar/text results,
multi-output extraction, and hostile queue URLs.

`tests/integration/run-history-upgrade.test.ts` uses Drizzle's actual migration
journal algorithm and all real `0000`–`0010` DDL in a rollback-only namespace. It
tests a fresh schema, populated `0009` upgrade preserving identities, grants,
consent, queued mail and original asset columns, unchanged earlier journal hashes,
and no-op rerun. Store integration covers ownership/lifecycle invariants. These
suites require the explicit disposable branch guard, never the runtime preview.

Migration review must verify least-privilege runtime grants: no schema creation
and no UPDATE/DELETE on `run_events` or `run_read_audits`. Their triggers also
reject row mutation and truncation. Actual executed test results and preview
migration outcome belong in the delivery handoff.

Remaining boundaries: no Console-owned media-file archival, no automatic
historical backfill, no ingestion of runs bypassing Console MCP, no guaranteed
recovery of receipts the SDK never exposes, and no automatic hosted recovery
scheduler. Gateway-wide ingestion needs coordination with John.

## Preview handoff — 2026-09-06

- Preview migration SHA-256:
  `50eb75d516ff72d0c090851d26063ff61f99d0f207fc7b8ed38a4c0ea4177fd0`.
- Applied journal hashes for `0000`–`0009` verified against the repository;
  rerunning `0010` reported `applied: false`.
- Before/after preview counts: 8 users, 159 signups, 2 admin grants, 53 access
  grants, 151 consent events, 8 queued/outbox records, 0 preexisting assets.
- Runtime grants permit run/recovery writes and event/audit append, not schema
  creation or audit mutation. Actual runtime-role inserts/updates and denied
  audit/DDL probes passed in a rolled-back preview transaction. No production
  database was touched.
- 382 unit/contract tests, 138 Console/MCP tests, 20 guarded database tests,
  lint, typecheck and production build passed.
  Build retains existing Auth0 configuration/dynamic-import and workspace-root
  warnings; a successful build is not proof of a configured login flow.
- Disposable real-schema integration tests cover fresh and populated migration,
  preservation, no-op rerun, lifecycle, ownership, worker fencing and execution
  fault injection. Those 15 tests roll back their fixtures; the five additional
  concurrency tests use committed synthetic fixtures as described below.
  No paid generation or emails.
- Browser checks use the real components with fictional authentication/network
  responses: Admin search/status filters and shared drawer, Home recorded plus
  usage-only groups, old records, and mobile overflow. These are not a hosted,
  authenticated preview end-to-end test.
- Real cross-connection concurrency testing now passes. Five deterministic cases
  exercise duplicate completion, conflicting terminal outcomes, stale version
  updates, competing worker claims, and replacement-receipt versus stale-worker
  completion/release. Distinct backend PIDs and PostgreSQL's blocking-lock graph
  prove genuine overlap; these are not concurrent calls on a single transaction.
  This is targeted race coverage, not a production-scale load benchmark.

### Repeating the concurrency rehearsal

`tests/integration/run-concurrency.test.ts` requires the existing explicit test
URL/host/branch variables plus
`TEST_DATABASE_ALLOW_COMMITTED_FIXTURES=run-concurrency`. It accepts only the
approved disposable branch `br-super-bird-auln2med`, checks its pre-provisioned
database marker, and rejects URL options that could override the target.

Run with the repository toolchain:

```sh
mise exec -- pnpm exec vitest run tests/integration/run-concurrency.test.ts
```

Unlike the rollback suites, this test commits a uniquely named `runrace_<uuid>`
schema containing the real migration chain and synthetic identity/run fixtures,
so separate connections can observe each other's transactions. Each worker uses
its own transaction and transaction-local search path. Teardown verifies the
schema's ownership marker, drops only that exact test schema, and asserts it is
gone. Successful teardown was verified after testing. A hard process kill may
prevent teardown; inspect and verify the unique schema marker before manually
removing any leftover test schema. Never run this suite against runtime preview
or production, or drop schemas by a wildcard.

After separately authorizing the push/deployment:

1. Confirm the deployment uses the isolated preview runtime URL and the journal
   includes this migration hash. Keep migration-before-code ordering elsewhere.
2. Sign in as the existing preview admin and confirm Home, Console Access and
   Platform History load. Verify another ordinary user cannot call admin APIs or
   read the admin's private run detail URL.
3. With an explicitly configured no-cost test capability, submit nested MCP JSON
   and inspect its `run_id`, submitted/returned JSON, status and asset references
   in both histories. Do not substitute a paid model without approval.
4. Check text-only, multi-output, rejected and interrupted scenarios. A run without
   a recoverable provider receipt must remain unknown with its reason.
5. Hide an asset through `forget_assets`: agent discovery should omit it while run
   history retains the reference. A seven-day-old run must still be listed.
6. Check usage-only continuation separately from recorded-run pagination; matched
   gateway IDs must not appear as extra successful runs. Simulate a billing outage
   and confirm saved history stays usable.
7. Inspect administrative read audits. Run the guarded one-shot recovery worker
   only when desired; hosted recurring scheduling requires a separate rollout.

The concurrency gate is closed. Do not label the release fully accepted until
the real signed-in preview checks are complete after authorized deployment.
