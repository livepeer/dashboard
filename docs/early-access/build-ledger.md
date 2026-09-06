# Early access build ledger

## Status

Dependency: PR46, commit44aa3a9. Integration branch:
`codex/early-access-foundation`. Production unchanged. Delivery boundary:
reviewed stacked PR + isolated preview + migration dry run, not production.

## Wave 0 — discovery

| Owner             | Findings                                                                                                                         | Status              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| data_owner        | Issuer absent; schema monolithic; consent projections; preserve multiple external IDs; app-scoped inventory has no Auth0 subject | Complete, read-only |
| identity_engineer | Email-only cross-provider joining unsafe; external ID regenerated; session/API/MCP boundaries need shared approval               | Complete, read-only |
| qa_foundation     | Existing tests encode old fail-open product policy; no general CI; disposable DB guard missing; key exchange/refresh bypasses    | Complete, read-only |

## Contract freeze v1

See architecture.md and lib/platform/contracts.ts. Single migration author:
data_owner. Shared interfaces and amendments: coordinator only. No subagent may
read env files, credentials, remote service data, or run credentialed commands.
Worktrees are edit isolation, not a credential security boundary.

## Wave 1 — assignments

| Owner             | Worktree                  | Exclusive ownership                                                                                     | State    |
| ----------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| data_owner        | .agent-worktrees/data     | lib/db/schema.ts, lib/db/schema/**, drizzle/**, scripts/early-access/\**, lib/db/*migration*test*       | Assigned |
| identity_engineer | .agent-worktrees/identity | lib/authentication/**, lib/external-accounts/**, lib/identity/\*\* except session-compatibility.test.ts | Assigned |
| qa_foundation     | .agent-worktrees/qa       | tests/support/**, tests/contracts/**, lib/platform/_test_                                               | Assigned |
| coordinator       | integration               | shared contracts, ledger, package/config/CI, integration and remote operations                          | Active   |

Implementers must report base commit, changed files, exact test commands/results,
unresolved risks and handoff commit. Root commits/integrates worktree patches;
agents do not mutate git history or install dependencies. Independent reviewers
will not be authors of the reviewed subsystem. Findings invalidate affected
signoffs until fixed and rerun against the new commit.

## Integration evidence — foundation in progress

- `fe986b7`: schema module foundation (data owner).
- `932b32f`, `73def06`: disposable-database marker, fixture harness and legacy
  waitlist suite guard (QA foundation).
- `7f8c431`: provider adapter, scoped identity resolution, persisted external
  accounts (identity owner).
- Coordinator contract amendment 1: approval-protected browser profile;
  eliminate client-side Auth0-subject billing-ID derivation.
- Coordinator local `mise exec -- pnpm test`: 104 passed, 19 database tests
  skipped pending credentialed migration gate. This is not preview evidence.
- New preview: `br-holy-sound-auugm104`, schema-only, zero signups.
- Disposable tests: `br-super-bird-auln2med`, child of that empty preview, zero
  signups. Neon schema-only root quota prevented a second schema-only root;
  using the empty preview parent copies no production contacts.
- Both new branches verified against deployed 0004 shape, journal initialized
  for the schema-only clone, dependency migrations 0005/0006 applied. Test marker
  exists only in disposable branch. Original shared preview unchanged.

Current status: foundation implemented; unit-tested; migration/identity DB tests
pending. Product behavior, independent review and preview verification pending.
No production readiness claim. Production inventory credentials/evidence still
need reconciliation; local Console configuration lacks the M2M secret and the
expected M5 Console project is absent. Do not infer production users from the
Auth0 tenant or preview accounts.

## Wave 1 gate passed; Wave 2 assignments

- Migration/planning tests: 10/10 pass on marked disposable Postgres; includes
  upgrade from 0004, repeated backfills and synthetic grandfather reconciliation.
- Identity DB tests: 16/16 pass after `fedaa4f` corrected a fixture that attempted
  to mutate immutable billing mappings. No weakening of the database constraint.
- Existing Console/MCP suite: 85/85 pass. Root lint and typecheck pass.
- These are foundation results, not final admission/security signoff.

Wave 2 base: `fedaa4f`. All specialists read frozen ADR/contracts before edits.

| Owner          | Worktree                | Ownership                                                                                                                                            | Handoff     |
| -------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| access_backend | .agent-worktrees/access | access services except page.ts; admin/subscription/email domains; session-user; access/admin/profile/enrollment/consent routes; legacy session tests | In progress |
| admin_ui       | .agent-worktrees/ui     | admin page/components; waiting screen; explicit protected page wrappers; access/page.ts; AuthContext; UI contract tests                              | In progress |
| mcp_security   | .agent-worktrees/mcp    | MCP modules/callback/token; key exchange; device approval; internal mint; BFF error mapping; MCP contract tests                                      | In progress |

Coordinator owns configuration, environment validation, credentials, Git/CI,
integration, preview provisioning and release evidence. Shared signature amendment:
AccessError has status/code; approved resolvers return AccessDecision including
canonical userId. Specialists may not add alternate authorization policy.

## Independent audit — changes required, fixes in progress

- Data reviewer at `4d2c919`: P1 conflicting billing binding in grandfather
  reconciliation; P2 unaudited signup-grant activation. Author fixed both in
  `2874df8`; root reran migration/planning DB suite 10/10 including the new
  regressions. Independent re-review still required.
- Security reviewer at `4d2c919`: SEC-01 high, inherited authorization-code
  replay. Data owner added 0008 receipt table in `2874df8`; coordinator implements
  consumption without changing wire format. Original MCP-author recall and a
  replacement spawn both hit runtime thread-limit errors; ownership explicitly
  reassigned to coordinator, not the reviewer.
- SEC-02 medium: inherited reusable, unbound refresh credentials. Compatibility
  disposition requested from user; not silently accepted or declared fixed.
- Backend self-review found stale newsletter retry risk. Author added shared
  consent/delivery locking and current-state reread in `dbcbdc5`.
- UI `0d759e3`: 22 local tests; MCP `4d2c919`: 48 local tests. Root integrated
  UI/security/config contract run:115 tests passed. These do not substitute for
  live staging issuer or protected preview evidence.
- Read-only staging discovery/JWKS:200, advertised issuer matches staging,
  one RS256 key. Actual user-token claim compatibility remains preview verification.

## Reviewed code checkpoint and preview publication

Code checkpoint: `48b45dda5dab9d0c417933b00b2c0859d7adb969`.
Independent security reviewer closed SEC-01, SEC-03 and migration P1/P2; no
unresolved high/critical finding in reviewed code. SEC-02 medium remains pending
user compatibility disposition. Independent UI/MCP reviewer closed QA01–QA04 at
`bd8572b` (later change is migration tooling only); 77 focused +85 Console tests.
The latter reviewer authored migrations, so provided **no data self-signoff**;
security reviewer independently reviewed the data fixes.

Integrated evidence:220 unit tests and typecheck pass;85 Console/MCP tests pass;
lint and production build pass (known Auth0 bundler warnings). Credentialed tests:
identity16/16, access/enrollment/bulk/consent10/10, waitlist routes3/3. Migration
regressions rerun separately after each author fix. Shared DB tests run serially;
the waitlist guard rejects outstanding outbox work, not completed synthetic history.

Remote stack: `codex/early-access-integration` remains at PR46's `44aa3a9`;
`codex/early-access-foundation` is the feature/review head targeting that separate
integration base. PR46 remains open and unchanged. Local specialist commits are
preserved in feature history. GitHub-signed publication head is required before
Vercel preview execution; verification policy is not weakened.

New runtime preview uses isolated `br-holy-sound-auugm104`, migrations through0008,
restricted runtime role, independent preview-only secrets, captured email, explicit
staging PymtHouse scope and its own MCP origin. Configuration is branch-scoped.
Preview acceptance and live token compatibility are **not yet claimed**.

## User amendment — Auth0-first joining and consolidated PR

User approved replacing waitlist join/sign-in with Auth0 and moving administration
inside Console chrome. Frozen contract: architecture amendment4, `91a19d2`.
No provider replacement, migration, credential change, production write or merge.

| Owner                | Worktree        | Scope                                                                                               | Handoff                                    |
| -------------------- | --------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Coordinator          | root            | Contracts, entry routing, integration fixtures, current-main MCP merge, Git/preview                 | `85a96eb`, `b0ce454`, `053dc5f`, `c18fc0f` |
| access_backend       | auth0-backend   | Auth0 join/sync, canonical admin/CSV/member permissions, enrollment context, consent authentication | `8738def`, referral fix `6b4c071`          |
| data_owner (UI role) | auth0-ui        | Auth0 CTAs, Console admin layout/navigation, membership preferences, legacy-link notices            | `48e462c`, `83d34f0`                       |
| security_reviewer    | review-security | Independent exact-commit MCP and Auth0 boundary review; no implementation edits                     | `b0ce454`, `48e462c`, final `c18fc0f`      |

PR48 now targets main and includes PR46. PR46 is closed as superseded; its branch
and commits are preserved. PR48 remains draft. Current main `b3439cd` (CIMD
Codex/ChatGPT compatibility) was merged into the feature branch, not into production.
Token conflict resolution retains the shared approval gate and single-use receipts.

Implemented: Auth0-first join/sign-in, bounded referral/UTM return context,
admin→`/admin`, approved→`/home`, pending→waiting, explicit protocol return paths,
server-owned admin navigation and permissions, disabled/revoked precedence.
Old cookies no longer authorize member, consent, admin or CSV operations. Old
verification links confirm enrollment only, never a session or deferred consent.
Resend remains email delivery, with preview capture isolation unchanged.

Independent review found SEC-05: background membership reads could enroll before
referral context. Author fixed it by making reads non-enrolling. Reviewer closed
SEC-05 at `c18fc0f`;19 focused tests reproduced. No new critical/high findings.
SEC-02 (reusable/unbound refresh credentials) and SEC-04 (current-main native
loopback redirect flexibility at redemption) remain unresolved production holds.
They have not been silently accepted. No production-readiness claim.

Integrated checks:253 unit tests passed (33 database cases intentionally skipped
in credential-free run),108 Console/MCP tests passed; lint and typecheck passed.
Disposable Postgres:11 access/enrollment/bulk/consent checks +5 route checks passed;
the latter reran after SEC-05 with a real authenticated-read-before-referral-join
regression. Production build passed after regenerating stale route types caused
by moving `/admin`; final exact-source build and unchanged identity/migration
rechecks run before preview handoff. Existing Auth0 bundler warnings remain.

Preview publication stays on the existing isolated protected feature alias;
GitHub-signed head required, no protection-policy bypass. Live Auth0 callback,
admin/approved/pending browser acceptance and actual staging token issuance are
separate verification gates, not implied by mocked tests. Production inventory,
grandfather activation, secret reconciliation, cutover and access-enforcing
rollback planning remain unexecuted release work.

## Resend restoration — local verification

User reversed Auth0-first waitlist joining after closing PR48. Coordinator owns
this bounded restoration from clean head `91def27`; prior Resend implementation
source is `87f94c3`. Architecture amendment5 supersedes waitlist portions of4.

Restored email form, signup/rate limiting, verification/session cookies, referral
credit, consent verification/preferences, waitlist logout and durable outbox
integration. Removed superseded Auth0-only waitlist UI/helpers and assertions;
reinstated Resend regression coverage. Old join URLs and in-flight Auth0 waitlist
transactions return to the email form with bounded referral/campaign context.

Auth0 Console/admin authentication and shared approval/MCP enforcement remain.
Added explicit Console sign-in redirect for waitlist members visiting admin;
waitlist cookies alone cannot authorize CSV/admin. Waitlist logout cannot end an
independent Console session. Preserved same-origin logout protection and sanitized
signup failure logging. No schema, migration, account mapping, grant or production
environment changes. No new independent security signoff is claimed for this delta.

Verification:240 unit tests passed (31 DB cases skipped in credential-free run),
108 Console/MCP tests passed; typecheck, lint and production build passed (existing
Auth0 warnings). Three restored route integration tests passed on the marked
disposable Postgres branch with synthetic identities/mocked providers: signup,
email verification/session, referrals, consent, admin isolation, independent
logout, rate limits and outbox retry. No external email sent by these tests.

User explicitly authorized updating the existing preview after local verification.
Publish only the feature branch through the required signed-head workflow; retain
the isolated database and captured-email setting. No production environment change.
PR48 remains closed; do not create/reopen a PR without explicit user approval.

## Waitlist visual corrections — preview publication

User authorized publishing the existing branch for preview testing, explicitly
without a PR. Visual implementation commit: `ec0b5e9` (base `522afab`).
Coordinator-owned changes restore the original waitlist `-0.045em` display
tracking through a scoped token while preserving Console's zero default. The
animation canvas is taller, with projected logo/blur bounds checked across a
complete rotation; original logo sizes and motion remain unchanged.

Seven presentation regression tests, typecheck, lint, and production build pass.
Local browser verification confirmed the original tracking (-1.62px at 36px),
scoped to the waitlist, and a complete ring inside the enlarged canvas. Browser
checks are local evidence; deployed smoke checks follow publication. No fresh
independent security review is claimed for this presentation-only delta.

Retain the protected preview, isolated database, and captured-email configuration.
Actual inbox delivery is not enabled or proven by this publication. No schema,
auth, approval, secrets, production, PR, or domain changes are included.

## Preview transactional Resend delivery

User explicitly authorized real preview mail for verification/sign-in and access
invitations. Coordinator implementation `8dc44f7` adds the explicit preview mode
`send_transactional`; unspecified/unsafe modes remain blocked. Newsletter events
are always captured in preview, even when transactional sending is enabled, and
cannot synchronize production Contacts. Outbox completion records the per-event
capture decision and clears token-bearing payloads after actual sending.

Only this feature branch's Vercel preview received the existing sending-only
Resend credential, sender/reply-to, and delivery mode. Credentials were copied
privately, not committed or displayed. No production config, schema, grants, PR,
or newsletter Contacts changed. The isolated preview had zero outstanding outbox
events before enabling delivery; no backlog was processed. A Resend official
delivery-simulator request was accepted by the provider; this is transport
evidence, not human inbox confirmation.

Verification:253 unit tests passed (31 DB cases skipped in credential-free run),
108 Console/MCP tests passed,14 disposable-database waitlist/access integration
tests passed; typecheck, lint, and production build passed. New regression cases
cover live verification/approval delivery, captured newsletter changes, rejected
unsafe preview modes, and unchanged production sending. Existing admin UI tests
cover the Console page/sidebar and selection contracts. No fresh independent
review is claimed. User inbox, Auth0 login, and privileged admin-browser acceptance
remain separate checks; never infer or grant admin authority from email alone.

## Console presentation cleanup — September 4, 2026

User authorized publishing the feature branch after local design acceptance,
without creating or reopening a PR. Starting remote/local head: `739c0f6`.
Coordinator owns this delta; no fresh independent security signoff is claimed.
Publish as focused GitHub-verified commits, retaining all earlier branch history:

- Shared auth screen/card, pending identity presentation and trusted referral
  lookup; reusable referral card; intrinsic Home balance/card wrapping.
- Verified/subscribed/unverified admin filters and bounded selected-email CSV
  export, protected by the existing administrator and same-origin checks.
- Simplified admin selection UI and Waitlist/History navigation. Platform History
  remains a fictional, non-networked presentation preview, using Home's actual
  `CallsTable` and `CallDetailDrawer`, not a second inspector implementation.
- Restored persisted Light/Dark/System appearance controls in the bottom-left
  account menu. Root and Console pre-paint theme setup agree with that preference;
  referral surfaces use card, border, and foreground theme tokens.

Validation: 293 Vitest tests passed (32 database-dependent tests skipped in the
credential-free run); 108 Console/MCP Node tests passed. All 12 access-domain
integration tests passed on the marked disposable database branch
`br-super-bird-auln2med`, including filters, frozen selection, consent, access
transitions, and selected exports. Typecheck, lint, and production build passed
with existing Auth0/dependency and local missing-auth-config warnings.

Local browser evidence: Home/Admin navigation and the shared inspector; Home
balance stays unwrapped and at a stable content-relative Y position at 16 widths;
26 admin stats checks confirm unwrapped labels with 4/2/1 columns. Local fixture
appearance checks confirm Light/Dark/System selection, persisted reloads, OS
updates in system mode, and at least 4.5:1 referral title/link contrast after
transitions settle. Local fixture
scripts and synthetic backend adapters remain outside the repository; they are
not deployed authentication bypasses. Hosted callback, inbox, real admin selection,
and preview acceptance must be checked against the newly published deployment.

No schema/migrations, canonical-account merges, new admin grants, credentials,
production data, outbox backlog, production configuration, domains, or PR state
changed. Existing release blockers and production holds remain in force.

### Follow-up UI polish — 2026-09-04

- Reused the existing birds-and-pixels image on the shared referral card, with
  a contrast overlay and decorative-image accessibility coverage.
- Added horizontal padding and reserved selected-weight label widths to both
  admin table filter groups. Browser checks found no position or size shifts
  across selections at 1280, 640, and 375px.
- Removed appearance-control borders/shadows and used `bg-foreground/3` for the
  selected icon. Browser checks confirmed all three choices use the intended
  background without borders or shadows.
- All 41 focused tests, focused lint, and typecheck passed; the production build
  passed with the existing warnings. Local-only fixture
  navigation and toast wiring stay outside the repository; no auth bypass or
  fictional backend is included in this update. No PR or production action.

### Main / MCP reconciliation — 2026-09-05

Coordinator integrated feature input `44656c4` and main `aab9b61` in a separate
local worktree. Kept the existing migration chain; reviewed but did not apply the
separate squash proposal. Resolved JWT claim handling without dropping app/access
enforcement, adapted Admin History to main's modality contract, and corrected
asset-test isolation and empty-selection deletion behavior.

Validation: 306 credential-free Vitest tests passed (33 database tests skipped),
137 Console/MCP Node tests passed, and 42 tests passed in the full guarded
database run. Full lint, typecheck and build passed. Existing hosted preview
checks confirmed auth/discovery routing and anonymous denials, but found that
`mcp_assets` is not yet present. That blocks hosted asset validation. No runtime
preview or production schema changes were made during reconciliation.

Details, findings and remaining gates:
[reconciliation-2026-09-05.md](./reconciliation-2026-09-05.md).

### Authorized preview preparation — 2026-09-05

User approved publishing the reconciliation and preparing the existing isolated
preview, without a PR or production change. Applied only `0009_mcp_assets` after
verifying every existing journal hash/timestamp. Preserved 7 canonical users,
8 signups, 6 outbox records and 2 admin grants. Granted asset CRUD to the existing
preview runtime role; it still cannot create schema objects or update/delete
access audit events.

Added a repeatable, preview-host/branch-guarded 150-contact seed and reserved-domain
email capture. The seed creates no users/admins/outbox events and never overwrites
an existing fixture set. Fixtures will be added only after the exact deployed
revision includes the capture rule. No newsletter Contacts calls or production
data writes are authorized by this preview run.
