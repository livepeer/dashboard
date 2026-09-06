# Waitlist cutover runbook

Console now owns the public `/waitlist` and `/verify` routes, the waitlist API,
and the waitlist-session-protected `/admin` export. Auth0 remains the Console
credential authority. The waitlist magic-link session remains separate and is
the only session accepted by `/admin`.

## Database boundaries

- Migrations `0000` through `0004` reproduce the deployed waitlist schema.
- Migration `0005_canonical_user_foundation` adds `users`,
  `auth_identities`, `user_emails`, and the nullable waitlist user link.
- Migration `0006_auth_identity_provider_metadata` records the Auth0 authority
  and provider strategy on identities. Existing identities receive this metadata
  on their next successful reconciliation.
- Production uses the existing waitlist Postgres database. Preview deployments,
  CI, and destructive tests must use an isolated database branch.
- Do not copy production records. Apply `0005` in place after taking the
  provider's normal point-in-time backup and before enabling Console traffic;
  then apply `0006`. Neither migration rewrites waitlist contact data.

Authenticated requests keep the existing deterministic PymtHouse external user
ID. A successful Auth0 login also best-effort upserts the application-owned user,
identity, and primary email. Only an Auth0-verified email can link a confirmed,
unclaimed waitlist record. Conflicts are logged and never overwritten. Existing
Console behavior continues when synchronization is unavailable; endpoints that
require the canonical record must use `requireCanonicalUser()` and fail closed.
That resolver also rejects disabled canonical profiles with a 403; existing
Console and MCP authorization behavior remains unchanged.

## Required deployment configuration

Copy the existing production values into the Console Vercel production
environment for `DATABASE_URL`, `ATTRIBUTION_HASH_SECRET`, `RESEND_API_KEY`,
`RESEND_NEWSLETTER_SEGMENT_ID`, `EMAIL_FROM`, `EMAIL_REPLY_TO`,
`INTERNAL_OUTBOX_SECRET`, `NEXT_PUBLIC_SITE_URL`, and
`NEXT_PUBLIC_POSTHOG_KEY`. Configure equivalent preview values against an
isolated database branch. Keep Auth0, PymtHouse, and MCP variables unchanged.

The outbox retry worker is `POST /api/internal/outbox` with
`Authorization: Bearer <INTERNAL_OUTBOX_SECRET>`. Preserve the existing external
scheduler until an explicitly configured Vercel cron replacement is tested.

## Staged release checklist

1. Deploy a preview with the isolated database and migrations `0000`-`0006`.
2. Verify `/waitlist`, signup delivery, `/verify`, referrals, consent changes,
   newsletter sync, admin access, CSV export, and outbox retries.
3. Verify Auth0 callback and repeat-login reconciliation, including verified and
   unverified email cases and an intentional database outage.
4. Smoke-test billing, keys, device approval, MCP discovery, and `/api/mcp`; the
   external PymtHouse identifier must match its pre-cutover value.
5. Record production counts for signups, confirmed members, consent events, and
   pending outbox events. Apply `0005` and `0006`, deploy Console, and compare the counts.
6. Move `earlyaccess.livepeer.org` only after the deployed checks pass. Retain
   the standalone waitlist deployment and its domain mapping as the rollback
   target until the observation window closes.

Rollback means moving the domain back to the retained waitlist deployment. The
additive canonical-user migration may remain; it does not change legacy waitlist
or Console identifiers.

## Integration verification

Use an empty, schema-only Neon branch with migrations applied. Set
`TEST_DATABASE_URL` and `TEST_DATABASE_HOST` through an ignored environment file
or your secret manager, then run `mise exec -- pnpm test`. The integration suites
do not read `DATABASE_URL` as a fallback and reject the known production host.
Without explicit test credentials, integration cases are skipped; unit tests
still run. Route tests require an empty outbox and replace email and analytics
providers, so no real messages or contact updates occur. Fixture cleanup deletes
only that run's synthetic rows.

For a build alongside a running dev server, use
`CONSOLE_DIST_DIR=.next-cutover mise exec -- pnpm build`. The separate ignored
output directory prevents the build from replacing the dev server's artifacts.

## Preview setup and release gates (2026-09-04)

- Neon project: `nameless-art-07247468`, Livepeer Foundation organization.
- Isolated schema-only branch: `console-cutover-preview`
  (`br-lucky-mountain-au9vt319`); no production contacts or email queue copied.
- Branch-specific Vercel Preview variables are configured for
  `codex/waitlist-console-cutover`, with independent attribution/outbox secrets
  and a runtime role without schema-create permission. Production is unchanged.
- Vercel requires verified commits. Unsigned Git previews are canceled before
  build; preserve that policy and publish verified commits.
- Still required before cutover: deployed smoke tests, real Resend delivery,
  Auth0 callback and authenticated billing/device/MCP checks, production secret
  recovery, and coordinated rotation of the previously exposed DB credential.
- The existing attribution and outbox secrets were not available in either
  STUDIO's or M5's waitlist local/production-export environment files. Do not
  silently substitute preview secrets in production. Recover the originals or
  agree a rotation plan that updates the existing worker and preserves analytics
  identity continuity where needed.
- The production outbox baseline had 72 unprocessed/nonterminal events. Diagnose
  that backlog before enabling a production worker; do not bulk-replay it as a
  smoke test.
