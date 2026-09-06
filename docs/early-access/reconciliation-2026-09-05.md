# Main / MCP asset reconciliation — 2026-09-05

## Scope and provenance

- Integration worktree: `.agent-worktrees/reconcile-main`, branch
  `codex/reconcile-main-mcp`.
- Feature input: `44656c4` (includes prior UI publication `c6d3e9a`).
- Main input: `aab9b61`, including RFC 8707 hardening `fe5505b` and usage/history
  changes from PR #47.
- PR #50 is closed, not merged. The separate squash branch at `839ba3c` was
  inspected but deliberately not integrated: preview already applied 0005–0008,
  and that proposal predates the new 0009 asset migration.
- Coordinator review, not a fresh independent security audit. No production
  writes, email delivery, grant changes, migration squashing, or remote publication.

## Reconciliation and review findings

| Finding                                                                                                                              | Disposition                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWT merge conflict: main adds legacy subject normalization while the feature branch enforces app scope and rejects ambiguous aliases | Combined both; signature, issuer, audience, expiry, scope, app binding, persisted-account and approval gates remain. Added signed-token regressions for legacy hashing, explicit aliases and contradictory subject types.             |
| Asset tests opted into writes using application `DATABASE_URL`                                                                       | Removed this path. Tests now require the existing TEST_DATABASE_URL/host/branch marker guard; own schema and synthetic rows are transactionally rolled back. Moved out of Node's MCP test glob into the Vitest integration directory. |
| Explicit empty asset ID selection deleted every persisted asset                                                                      | Empty/blank selections now delete nothing; omitted IDs retain the documented delete-all-for-current-principal behavior. Ownership, retry idempotency, literal search and 130-ID batching tested.                                      |
| Invalid chunk size could cause a nonterminating loop                                                                                 | Reject nonpositive, fractional or nonfinite sizes with regression tests.                                                                                                                                                              |
| Admin sample rows lacked main's required modality field                                                                              | Reuse main's capability-modality resolver; preserve shared CallsTable and CallDetailDrawer.                                                                                                                                           |
| Migration assertions stopped at 0008                                                                                                 | Extend journal and production-schema upgrade assertions through 0009, keeping 0000–0008 unchanged.                                                                                                                                    |
| Hosted preview lacks `mcp_assets`                                                                                                    | Preview blocker. Deployment success does not prove schema readiness. No schema writes performed in the runtime preview during this review.                                                                                            |

## Checks completed

- Credential-free Vitest: 306 passed, 33 database-dependent skipped.
- Console/MCP Node suite: 137 passed.
- Full lint, typecheck and production build passed (existing workspace-root and
  Auth0 dependency/configuration warnings remain).
- Guarded asset suite: 10 passed, including real disposable Postgres persistence
  and principal isolation; synthetic schema/data rolled back.
- Full guarded database run: 42 passed across five suites (migration through
  0009, identity, access, waitlist routes and assets); 177 seconds. Only the
  separately marked disposable integration branch was used for writing tests.
- Local reconciled UI: both table panels/filter states stable at 1280, 640 and
  375px. Separate loopback-only fictional fixture on port 3015; not an auth test.
- Home/Admin navigation and the shared inspector passed browser checks, including
  the truthful "No output stored for this job" state and no page errors.
- Existing hosted feature preview: waitlist 200; anonymous admin page redirects;
  admin list denies with its existing 403 response; Console session and MCP
  initialization deny with 401; MCP resource URL and Auth0 callback point at
  preview. Existing preview account retains one active admin grant.

## Remaining preview/release gates

- Publish the reconciled commit only with user authorization. Current hosted
  checks do not certify this local integration tree.
- Apply 0009 to the isolated runtime preview after checking its journal, then
  verify runtime-role SELECT/INSERT/UPDATE/DELETE permissions on the new table.
  Do not run automated writing tests against that preview or the user's account.
- Repeat authenticated admin/admission and MCP asset checks on the exact deployed
  revision. No paid generation, marketing changes or email backlog processing
  occurred during this review.
- Main intentionally leaves `attachOutputsToTickets` as a no-op. Persisted MCP
  assets do not yet populate personal History previews. Admin Platform History
  remains a presentation fixture, not a live platform-wide feed.
- Existing production grandfathering, secrets/configuration, security acceptance,
  access-enforcing rollback and cutover holds remain unchanged.
