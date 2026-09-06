# Migration rehearsal and production hold

Status: foundation rehearsal passed; production grandfathering evidence incomplete.
No production migration, approvals, emails, credential rotation or cutover executed.

## Read-only production inventory

Snapshot: 2026-09-04T23:34:31.710Z, existing waitlist production database,
explicit read-only transaction. Only aggregate results retained in repository.

| Check                                    | Count |
| ---------------------------------------- | ----: |
| Waitlist entries                         |    65 |
| Confirmed                                |    52 |
| Legacy administrators                    |     3 |
| Consent history events                   |    72 |
| Pending outbox records                   |    80 |
| Legacy consent discrepancies             |     0 |
| Canonical identity/access/account tables |     0 |
| Migration journal entries through 0004   |     5 |

Migration-journal checksum (SHA-256 over ordered hash/timestamp records):
`e5e47ea123773761f71193f320ad50426891cdcab2f387b8e5e5d7b6c3cd2f73`.
Outbox counts are a snapshot, not permission to process the backlog.

## Isolated rehearsal

`br-super-bird-auln2med` is the marked disposable test database, separate from
both the old user-test preview and the new runtime preview. Migration test builds
0000–0004 in a transaction-local synthetic schema, seeds legacy fixtures, applies
0005–0007, verifies preserved counts, admin/subscription backfill idempotency,
uniqueness/FKs, append-only audit, immutable aliases and synthetic grandfather
dry-run/repeat application/revocation rejection, then rolls back.

Foundation results: migration/planning 10/10 and identity integration 16/16 pass.
This proves mechanisms with synthetic fixtures, not a completed production-user
grandfather manifest. Runtime preview role was separately verified to have no DDL
privilege and no access-event UPDATE/DELETE privilege, with SELECT/INSERT allowed.

## Production blockers

- Obtain app-scoped production PymtHouse inventory and trusted Console-specific
  authentication evidence with an explicit reviewed cutoff. Local/exported M2M
  secrets are masked/unavailable. Never infer identity from email or approve all
  Auth0 tenant users. No empty manifest is accepted as evidence of completeness.
- Reconcile every unresolved identity/account and approve the private manifest
  checksum. No actual production grandfathering counts are claimed yet.
- Restore original attribution/outbox secrets and coordinate previously identified
  credential exposure remediation before production. No rotation in this build.
- Final independent review and preview gates remain separate from foundation tests.
- Later release must provide an access-enforcing rollback target; the old ungated
  deployment is not an acceptable rollback after admission enforcement activates.
