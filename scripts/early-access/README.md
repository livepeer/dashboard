# Early-access migration tools

## Isolated preview contacts

`seed-preview.ts` exports `seedPreviewContacts(env, apply = false)`. It accepts
only `PREVIEW_SEED_DATABASE_URL` on the approved preview host and
`PREVIEW_SEED_BRANCH_ID=br-holy-sound-auugm104`; it never falls back to
`DATABASE_URL`. The default is a read-only count. Keep the URL in an ignored
private environment file, never in command arguments or logs.

Before applying, verify that the deployed preview includes the reserved-domain
capture rule, then supply `PREVIEW_FIXTURE_CAPTURE_READY=1` and `apply=true`.
It adds 150 contacts at `preview.livepeer.invalid`, all tagged
`preview_fixture_v1`: 90 waiting, 30 approved, 15 revoked, 15 unverified;
50 simulated subscriptions and 30 referrals. It creates no canonical users,
provider identities, administrator permissions or outbox events.

Reruns leave the existing fixture set and any manual changes intact. Partial
sets or collisions fail instead of overwriting records. A guarded disposable
Postgres test rehearses seed/repeat behavior and rolls back all changes.

The reserved fixture domain is captured only in Vercel Preview, including
approval invitations. Real inbox tests retain configured transactional delivery;
all preview newsletter synchronization remains captured. These simulated consent
records are not real marketing permission. This is not a production seed tool.

These tools never print credentials, email addresses, subjects, or customer IDs.
Private artifacts contain identity data: write them only outside the repository,
retain them with the release evidence, and never upload them to a PR. Files are
created with mode0600 and exclusive creation; existing files are not overwritten.

Run through the repository's mise/pnpm toolchain. No command reads `.env` files
implicitly. The coordinator supplies environment values privately.

## Inventory and manifest (read-only)

`pnpm exec tsx scripts/early-access/fetch-inventory.ts --fetch --issuer URL --app-id APP --output /private/tmp/private-inventory.json`

Requires the existing PymtHouse M2M credentials in environment variables. Uses
only `listAppUsers()` for the explicit public app and refuses mixed-app output.
This does not list every Auth0 tenant user or modify any service.

`pnpm exec tsx scripts/early-access/build-manifest.ts --input /private/tmp/private-input.json --output /private/tmp/private-manifest.json`

Input shape:

```json
{
  "scope": {
    "service": "pymthouse",
    "issuer": "https://issuer.example/api/v1/oidc",
    "appId": "console-app"
  },
  "auth0Issuer": "https://login.example",
  "cutoff": "2026-09-04T00:00:00.000Z",
  "inventory": { "users": [] },
  "evidence": [
    {
      "subject": "auth0|synthetic",
      "issuer": "https://login.example",
      "source": "console_authentication",
      "occurredAt": "2026-09-03T00:00:00.000Z"
    }
  ]
}
```

Inventory records use the SDK's exact `AppUserRecord` fields. Evidence must come
from trusted Console-specific authentication logs or an audited Console identity
inventory. Merely existing in the Auth0 tenant or sharing an email is not evidence.
The manifest correlates deterministic historical external IDs, app scope, issuer,
and cutoff. Inactive accounts, missing evidence, and duplicates block release.
Reviewers retain original evidence sources privately and approve the checksum.

## Database rehearsal (isolated database only)

`pnpm exec tsx scripts/early-access/reconcile-manifest.ts --manifest /private/tmp/private-manifest.json --reviewed-checksum CHECKSUM`

Default is rollback-only rehearsal. Requires `TEST_DATABASE_URL`, exact
`TEST_DATABASE_HOST`, `TEST_DATABASE_BRANCH_ID`, and the separately provisioned
integration database marker. `--apply-isolated` enables idempotent test backfill
only on that disposable marked branch. Production execution is intentionally
not offered by this build.

Legacy null-issuer identities are adopted only with the exact alias and explicit
original issuer. Multiple historical accounts on a user remain separate. Missing
canonical records are created only from the reviewed prior-authentication proof.
No waitlist-only contact is promoted. Disabled users, revoked grants, duplicate
identities, and conflicting account owners abort the entire batch. This operation
does not emit invitation emails or change subscriptions.

## Migration and permissions

Migration0007 is additive. It backfills admin grants and subscription snapshots,
links historical consent records, and creates no product grants. Subscription
rows with source `legacy_consent_conflict` require reconciliation before release;
their state defaults to unsubscribed, while original evidence is preserved.

Access events are database-enforced append-only, including TRUNCATE protection.
Legacy identity aliases and external account mappings cannot be overwritten.
The release operator must grant the runtime role SELECT/INSERT on access_events
and the necessary SELECT/INSERT/UPDATE permissions on operational tables; do not
grant UPDATE/DELETE/TRUNCATE on access_events. DDL/migrations require a separate
owner credential. New-table privileges are not assumed to inherit from old ones.

Integration migration tests require the same disposable marker, create a random
schema inside a transaction, apply migrations from0000, and rollback all fixtures
and DDL. They never truncate shared databases or alter production records.
