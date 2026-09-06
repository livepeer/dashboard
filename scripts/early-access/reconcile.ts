import type postgres from "postgres";
import {
  checksum,
  legacyExternalId,
  normalizeIssuer,
  type GrandfatherManifest,
} from "./manifest";

export function assertReviewedManifest(
  manifest: GrandfatherManifest,
  reviewedChecksum: string
) {
  const { provenance, entries, unresolved, excludedAfterCutoff } = manifest;
  const digest = checksum({
    provenance,
    entries,
    unresolved,
    excludedAfterCutoff,
  });
  if (
    manifest.version !== 1 ||
    digest !== manifest.manifestChecksum ||
    digest !== reviewedChecksum
  )
    throw new Error("Reviewed manifest checksum does not match");
  if (unresolved.length)
    throw new Error("Unresolved inventory records block backfill");
  if (
    normalizeIssuer(provenance.auth0Issuer) !== provenance.auth0Issuer ||
    normalizeIssuer(provenance.scope.issuer) !== provenance.scope.issuer
  )
    throw new Error("Manifest issuers are not canonical");
  for (const row of entries) {
    if (
      row.authority !== "auth0" ||
      row.issuer !== provenance.auth0Issuer ||
      row.externalUserId !== legacyExternalId(row.subject)
    )
      throw new Error("Manifest identity evidence is inconsistent");
  }
  if (new Set(entries.map((row) => row.externalUserId)).size !== entries.length)
    throw new Error("Duplicate manifest account");
}

type Sql = ReturnType<typeof postgres>;
export type BackfillResult = {
  inspected: number;
  identitiesCreated: number;
  issuersReconciled: number;
  accountsCreated: number;
  grantsCreated: number;
  blockers: number;
};

/**
 * Caller owns the database safety boundary. By default the whole transaction is
 * rolled back, including generated users/grants. Never exposes customer values.
 */
export async function reconcileManifest(
  client: Sql,
  manifest: GrandfatherManifest,
  options: {
    reviewedChecksum: string;
    apply?: boolean;
  }
): Promise<BackfillResult> {
  assertReviewedManifest(manifest, options.reviewedChecksum);
  const result: BackfillResult = {
    inspected: 0,
    identitiesCreated: 0,
    issuersReconciled: 0,
    accountsCreated: 0,
    grantsCreated: 0,
    blockers: 0,
  };
  const rollback = new Error("intentional_manifest_dry_run_rollback");
  try {
    await client.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended('early-access-reviewed-backfill', 0))`;
      const scope = manifest.provenance.scope;
      // Acquire every manifest identity first. Otherwise a later identity on an
      // already-locked user can deadlock with a concurrent login holding that
      // identity while waiting for the same user lock. Sorting also gives all
      // reviewed batches the same identity acquisition order.
      const identityKeys = [
        ...new Set(
          manifest.entries.map(
            (row) => `identity:${row.authority}:${row.issuer}:${row.subject}`
          )
        ),
      ].sort();
      for (const key of identityKeys) {
        await tx`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      }
      for (const row of manifest.entries) {
        result.inspected++;
        // Identity and scope are authenticated provenance, never matched by email.
        const identities = await tx`
          SELECT i.id, i.user_id FROM auth_identities i
          WHERE i.authority = ${row.authority} AND i.provider_subject = ${row.subject}
            AND (i.issuer = ${row.issuer} OR i.issuer IS NULL)
        `;
        if (identities.length > 1) {
          result.blockers++;
          continue;
        }
        let identity = identities[0];
        if (identity) {
          // Runtime identity/account services take the user advisory lock before
          // touching user rows. Discover ownership without locks, then follow
          // the same order and revalidate the discovery under row locks.
          await tx`select pg_advisory_xact_lock(hashtextextended(${`user:${identity.user_id}`}, 0))`;
          const lockedIdentities = await tx`
            SELECT i.id, i.user_id, i.issuer, i.external_user_id, u.status
            FROM auth_identities i JOIN users u ON u.id = i.user_id
            WHERE i.authority = ${row.authority} AND i.provider_subject = ${row.subject}
              AND (i.issuer = ${row.issuer} OR i.issuer IS NULL)
            FOR UPDATE OF i, u
          `;
          const lockedIdentity = lockedIdentities[0];
          if (
            lockedIdentities.length !== 1 ||
            lockedIdentity.id !== identity.id ||
            lockedIdentity.user_id !== identity.user_id ||
            lockedIdentity.status === "disabled" ||
            (lockedIdentity.external_user_id != null &&
              lockedIdentity.external_user_id !== row.externalUserId) ||
            (lockedIdentity.issuer === null &&
              lockedIdentity.external_user_id !== row.externalUserId)
          ) {
            result.blockers++;
            continue;
          }
          identity = lockedIdentity;
          const bindings = await tx`SELECT a.id, a.user_id, a.external_user_id
            FROM identity_external_accounts b JOIN external_accounts a ON a.id = b.external_account_id
            WHERE b.identity_id = ${identity.id} AND a.service = ${scope.service}
              AND a.issuer = ${scope.issuer} AND a.app_id = ${scope.appId}
            FOR UPDATE OF b, a`;
          if (
            bindings.length > 1 ||
            bindings.some(
              (binding) =>
                binding.user_id !== identity.user_id ||
                binding.external_user_id !== row.externalUserId
            )
          ) {
            result.blockers++;
            continue;
          }
        }
        if (!identity) {
          const [user] =
            await tx`INSERT INTO users DEFAULT VALUES RETURNING id`;
          [identity] = await tx`INSERT INTO auth_identities
            (user_id, authority, issuer, provider, provider_subject, external_user_id, provider_metadata)
            VALUES (${user.id}, ${row.authority}, ${row.issuer}, ${row.subject.split("|")[0] || "auth0"},
              ${row.subject}, ${row.externalUserId}, '{"authority":"auth0","source":"reviewed_grandfather_manifest"}'::jsonb)
            RETURNING id, user_id, issuer, external_user_id`;
          result.identitiesCreated++;
        } else if (identity.issuer === null) {
          await tx`UPDATE auth_identities SET issuer = ${row.issuer} WHERE id = ${identity.id} AND issuer IS NULL`;
          result.issuersReconciled++;
        }
        let [account] = await tx`SELECT id, user_id FROM external_accounts
          WHERE service = ${scope.service} AND issuer = ${scope.issuer} AND app_id = ${scope.appId}
            AND external_user_id = ${row.externalUserId} FOR UPDATE`;
        if (account && account.user_id !== identity.user_id) {
          result.blockers++;
          continue;
        }
        if (!account) {
          [account] =
            await tx`INSERT INTO external_accounts (user_id, service, issuer, app_id, external_user_id, source)
            VALUES (${identity.user_id}, ${scope.service}, ${scope.issuer}, ${scope.appId}, ${row.externalUserId}, 'legacy_auth0_reconciliation')
            RETURNING id, user_id`;
          result.accountsCreated++;
        }
        await tx`INSERT INTO identity_external_accounts (identity_id, external_account_id)
          VALUES (${identity.id}, ${account.id}) ON CONFLICT (identity_id, external_account_id) DO NOTHING`;
        const [signup] =
          await tx`SELECT id FROM waitlist_signups WHERE user_id = ${identity.user_id}`;
        const grants =
          await tx`SELECT id, user_id, signup_id, status FROM access_grants
          WHERE user_id = ${identity.user_id} OR signup_id = ${signup?.id ?? null} FOR UPDATE`;
        if (
          grants.length > 1 ||
          grants[0]?.status === "revoked" ||
          (grants[0]?.user_id && grants[0].user_id !== identity.user_id)
        ) {
          result.blockers++;
          continue;
        }
        if (!grants.length) {
          const [grant] =
            await tx`INSERT INTO access_grants (user_id, signup_id, status, source, approved_at)
            VALUES (${identity.user_id}, ${signup?.id ?? null}, 'approved', 'existing_console_user', now()) RETURNING id`;
          await tx`INSERT INTO access_events (grant_id, action, source, next_status, grant_version)
            VALUES (${grant.id}, 'grandfather', 'existing_console_user', 'approved', 1)`;
          result.grantsCreated++;
        } else if (!grants[0].user_id) {
          const [activated] = await tx`UPDATE access_grants
            SET user_id = ${identity.user_id}, activated_at = coalesce(activated_at, now()),
              version = version + 1, updated_at = now()
            WHERE id = ${grants[0].id} RETURNING version`;
          await tx`INSERT INTO access_events
            (grant_id, action, source, previous_status, next_status, grant_version)
            VALUES (${grants[0].id}, 'activate', ${`reviewed_grandfather_manifest:${manifest.manifestChecksum}`},
              'approved', 'approved', ${activated.version})`;
        }
      }
      // Any conflict rolls back the entire reviewed batch, even in apply mode.
      if (!options.apply || result.blockers) throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return result;
}
