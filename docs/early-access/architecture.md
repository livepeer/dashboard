# ADR: application-owned identity and early access

Status: frozen v1 for parallel implementation. Base: PR46 / `44aa3a9`.
Changes require coordinator approval and an entry in the build ledger.

## Boundaries

Auth0 remains credential authority. Provider adapters produce `ProviderIdentity`
only after authenticated server-session verification. Provider identities are
unique by authority + normalized issuer + subject. Emails alone never join a new
identity to another canonical user. Explicit trusted linking is a server-only
migration operation, not a public endpoint. UUIDs remain application identity.

External PymtHouse accounts are unique by service + normalized issuer + app ID +
external ID. Identity bindings preserve multiple historical billing identities
on one canonical user. Existing aliases are immutable. Resolve an existing
identity binding first; otherwise use the sole user account in that scope;
multiple unbound accounts fail with `external_account_ambiguous`. A new account
gets `eu_` plus a UUID with hyphens removed, persisted exactly once. Never assign
a replacement account when an existing mapping is unresolved. The existing
Auth0-sub hash remains only for explicit legacy reconciliation.

Current identities gain authority and nullable issuer in the additive migration.
The separate legacy backfill requires an explicit original Auth0 issuer and
PymtHouse app scope. A null-issuer identity is not automatically adopted by a
login from an arbitrary provider. Backfill is coordinator-run only.

Waitlist signup is not approval; approval is not admin; neither implies marketing
consent. Verified authenticated users are enrolled once with source console_auth
and no marketing consent if absent. Pending matching waitlist entries may be
confirmed by the verified authentication; preserve their original referral and
consent data. Do not revive unsubscribed/suppressed contacts or revoked grants.
Unverified emails cannot claim a waitlist entry. Conflicting links are logged
without PII and never stolen.

## Data ownership

The schema compatibility barrel remains `lib/db/schema.ts`; domain definitions
move below `lib/db/schema/`. Append migration0007, never rewrite0000–0006.

- Identity: users/authIdentities/userEmails; externalUserId becomes nullable
  legacy compatibility data. No new identity rows need a subject-derived alias.
- Accounts: externalAccounts + identityExternalAccounts, scoped uniqueness and
  foreign keys, no user+scope uniqueness that would erase historical accounts.
- Approval: accessGrants targeting signup and/or user; one grant per nonnull
  signup and user. approved/revoked status, version and activation timestamps.
  accessEvents are append-only with actor, operation, source and state change.
- Admin: adminRoleGrants attached to verified waitlist signup, source and
  revocation timestamp. Backfill current admins, retain magic-link sessions.
- Bulk actions: accessOperations (admin actor + requestId unique, action and
  canonical payload hash), accessOperationItems unique operation+signup.
- Subscriptions: emailSubscriptions unique normalized address+purpose, nullable
  user/signup, subscribed/unsubscribed state, source and timestamps. Existing
  consentEvents gains subscription reference; preserve historical events.
  Conflicting historical consent fails closed to unsubscribed and is reported.

Migration backfills subscriptions/admin grants only. It must not grant product
access or create users from waitlist-only contacts. External alias and existing
Console-user grant backfills require explicit reviewed input, support dry-run,
are idempotent, and detect ambiguity. Production invocation is forbidden here.

## Frozen interfaces and ownership

`lib/platform/contracts.ts` is the shared DTO contract.

- Identity owner: `lib/authentication/session.ts:getAuthenticatedIdentity()`;
  `lib/identity/provider-user.ts:resolveProviderIdentity(input)` returns
  CanonicalIdentity; `linkProviderIdentityToUser` requires explicit trusted proof
  of an existing identity/user binding and has no public route.
- Identity owner: `lib/external-accounts/service.ts:resolveExternalAccount({
userId,identityId?,...scope})` and `findExternalAccountOwner({...scope,
externalUserId})`. Scope comes from server configuration, never request input.
- Access owner: `lib/access/service.ts:getAccessDecision(userId)`,
  `requireApprovedUser(userId)`, and `requireApprovedExternalAccount(scope,id)`.
  Throws typed errors with status/code, shared by Console and MCP.
- Access owner: `lib/access/enrollment.ts:enrollAuthenticatedUser(identity,
canonical)`; `lib/admin/auth.ts:getAdminPrincipal()`; `lib/subscriptions/service.ts`
  owns transactional subscription history + legacy projections + email events.
- Session orchestrator `requireConsoleSession` becomes the shared approval gate
  for existing protected BFF routes, returning the persisted external account ID.
  Authenticated-only status/onboarding use the identity adapter without this gate.

401 means no authentication; 403 means pending/revoked/disabled; 503 means access
could not be verified. Fail-open authentication does not grant fail-open product
access. No positive authorization cache in v1; check each protected request.
Unknown external account is denied, wrong issuer/app rejected, disabled overrides
approved. Public auth, waitlist, legal, discovery and explicit public catalog
routes remain public. Every backend route gets an explicit classification.

## UI and endpoints

- GET /api/access/status: 401 signed out, otherwise {state,userId,grantId?};
  unavailable uses503. Do not return email/provider details.
- GET /api/admin/access: admin only, search/state/page/pageSize (default50,max100),
  returns AdminAccessList with stable joinedAt+id ordering. state accepts
  waiting/approved/revoked/all; waiting means confirmed and not approved/revoked.
- GET /api/admin/access/selection: same filters, returns {signupIds,total}; this
  freezes explicit eligible IDs for all-matching selection, never a live query.
- POST /api/admin/access: BulkAccessRequest; returns {requestId,outcomes}.
  Maximum100 IDs per request; UI splits any larger frozen selection into chunks
  with stable per-chunk request IDs. Bind idempotency to admin+action+sorted IDs;
  changed payload with reused key returns409. Each item commits independently;
  failed items can retry under same key, completed items never reapply. No-op
  approval sends no duplicate invitation. Serialize concurrent grant mutations.
- Mutations require same-origin Origin plus authenticated admin; never trust
  forwarded Origin or body-supplied actor. Existing consent mutations get the
  same explicit cross-site protection.
- /access-pending: waiting/verify-email/revoked/unavailable variants; public auth
  remains accessible. Browser admission redirects here; API consumers get errors.

MCP callback, authorization-code redemption, refresh redemption, bearer request
handling, and device approval must use shared gates. Key exchange verifies the
issuer-signed exchanged JWT and app-bound owner before releasing any credentials.
Opaque responses without verifiable ownership fail closed; do not decode an
unverified JWT and treat its claims as authority. Existing token formats stay.

## Environment and release policy

Default production behavior after this feature ships is enforced access; no empty
allowlist bypass. Dev fixtures are permitted only under existing nonproduction
dev-mock switch. No production runtime changes, migrations, grants, emails,
secret rotation, merges or domain changes during this build.

Preview uses a new dedicated database branch, never the prior user-test preview.
Automated destructive tests use a separate disposable DB identity checked by the
coordinator and a database marker. Specialists have no remote credentials.
Preview email/subscription providers default to capture/no external dispatch;
dedicated preview test emails are retrievable only by administrators. Real
Resend contact writes require an independently isolated account, not merely a
segment within the production audience. Credentialed PymtHouse preview tests use
only the explicitly verified staging issuer/app scope (amendment 2 below).

Grandfather dry-run sources are the production PymtHouse app user inventory plus
trusted app-specific identity evidence, with explicit cutoff and checksums. Do
not use every Auth0 tenant account or approve uncertain mappings. Unresolved
records are reported as production blockers, not guessed into the manifest.

# Contract amendment 1 — browser profile

`GET /api/console/session` is approval-protected and returns
`ConsoleSessionProfile`. The browser consumes its persisted external account ID;
it must not hash an Auth0 subject. Provider display labels are presentation only.
The endpoint uses the same 401/403/503 authorization semantics as protected APIs.

## Contract amendment 2 — verified preview PymtHouse scope

Read-only Vercel environment export verified production is
`https://pymthouse.com/api/v1/oidc` / `app_98575870d7ae33589a3f0660`, whereas preview
is `https://staging.pymthouse.com/api/v1/oidc` / `app_088f2082a8f1161d60179431`.
The previous nonproduction RS2 guard hardcoded the production app and is not an
acceptable preview safety boundary. Preview minting must enforce the staging
issuer and app together; never change preview credentials to production to satisfy
the obsolete guard. Existing production identifiers and token formats stay intact.

## Contract amendment 3 — single-use OAuth code redemption

Independent review found inherited replayable authorization codes. Add migration
0008 with `oauth_code_redemptions`: unique SHA-256 code digest, expiration and
creation timestamps. No raw credentials are stored. After signature, PKCE and
approval validation, `consumeAuthorizationCode(code, expiresAt)` atomically inserts
the digest before token minting; duplicate redemption is invalid_grant and storage
failure is unavailable. A failed upstream mint still consumes the code; restart
authorization rather than risk duplicate issuance. Wire format remains unchanged.

This is an actively used protocol-security table, not a speculative MCP-client
or activity schema. Data owner alone authored the migration. Coordinator authored
the consuming fix after the agent runtime rejected both original-author recall
and replacement spawning at its thread limit. Security reviewer remains independent.

## Contract amendment 4 — Auth0-first waitlist and Console administration

User-approved replacement for v1's magic-link administration: joining and signing
in from `/waitlist` use Auth0. Resend remains delivery infrastructure, not session
authority. Existing waitlist rows, referrals, consent history and admin grants are
preserved. Legacy verification links may confirm their original enrollment but
must no longer create sessions or authorize membership, consent or administration.

`GET /api/waitlist/join` carries bounded public referral/attribution parameters
through Auth0's transaction-bound returnTo to `/api/identity/sync`. These fields
never convey email ownership, consent, roles, approval or external account IDs.
`enrollAuthenticatedUser(identity, canonical, context?)` accepts the shared
`WaitlistEnrollmentContext`; context applies only to a new enrollment, preserving
existing attribution/referrals. No implicit newsletter consent.

`getAdminPrincipalForUser(userId)` is a session-independent database permission
resolver: active user, trusted linked confirmed signup, active admin grant, and
no explicit revoked product grant. `getAdminPrincipal()` authenticates using the
provider adapter and resolves trusted enrollment before this permission lookup.
Neither Auth0 role claims nor legacy waitlist cookies grant permissions. The
shared access decision admits an active administrator or approved access grant;
disabled/revoked takes precedence, and database failures remain unavailable.

For ordinary post-login landing: admin → `/admin`, approved → `/home`, otherwise
→ `/access-pending`. Explicit safe protocol/device return paths remain intact
and enforce their existing server-side approval gates. `/admin` moves inside
Console chrome but retains its independent server-side admin check. The Console
session profile adds `isAdmin` for navigation only, never authorization.

`getCurrentWaitlistSession()` and newsletter preference endpoints use Auth0 and
trusted canonical signup ownership without requiring product approval. Anonymous
POST `/api/waitlist` no longer enrolls or sends sign-in links. The UI starts
Auth0 instead; legacy routes cannot bypass the new authentication boundary.
Auth0 logout replaces the custom waitlist-session logout in the browser.

Membership reads resolve existing ownership but never enroll. Only join/sync and
authenticated Console orchestration enroll; otherwise an already-authenticated
visitor's background session read could create an entry before referral context
arrives (independent review SEC-05). Legacy verification confirms an old entry
only; old tokens do not restore deferred or stale marketing consent.

This amendment needs no database migration or credential-provider change.
Production remains on hold. PR48 will include PR46 by targeting main; neither
PR is merged as part of this work.

Current-main MCP integration retains its native loopback host/port matching at
code redemption (SEC-04), along with PKCE, approval checks and single-use code
receipts. This compatibility exception and inherited unbound reusable refresh
credentials (SEC-02) are unresolved production-hold decisions, not audit acceptance.

## Contract amendment 5 — restore Resend waitlist authentication

User reversed the Auth0-first waitlist decision. `/waitlist` again uses email
signup, Resend verification/sign-in links, and independent waitlist-cookie
sessions for membership and consent. No Auth0 account is needed to join or view
membership. Restore referral attribution, rate limiting, outbox retry and consent
verification behavior. Existing email-link sessions remain usable. Old Auth0-join
bookmarks and in-flight return paths redirect to the email form with bounded
referral/UTM values; they do not enroll through Auth0.

Console, `/admin`, protected APIs and MCP keep Auth0 plus the canonical access
and admin-permission services. A waitlist-cookie session never grants Console
or administrator access. `/admin` directs signed-out visitors to Console sign-in.
Waitlist logout does not log out Console. Existing identity, approval, subscription
and billing schemas and migrations are unchanged; no data rollback or copy.

PR48 was closed at the user's request. Do not reopen or create a PR until the
user explicitly authorizes it. Preview publication requires user confirmation.
