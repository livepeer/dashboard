# Secret-free tests and isolated database fixtures

These helpers do not read environment files, create databases, apply migrations,
or seed real accounts. The coordinator supplies credentials only for dedicated
integration runs. A successful unit run with integration cases skipped is not
database verification.

## Database guard

Call `openIntegrationDatabase` with explicit `TEST_DATABASE_URL`,
`TEST_DATABASE_HOST`, and `TEST_DATABASE_BRANCH_ID` values. Never fall back to
the application's `DATABASE_URL`. The returned `target` is safe to log; the URL
is intentionally absent. Add the current runtime preview hostname to
`forbiddenHosts`. Production and the original shared preview endpoint families
are rejected regardless of this option.

The coordinator must create `console_test_guard` separately in the disposable
database, with exactly one row containing `branch_id` equal to the independently
approved branch ID and `purpose` equal to `integration`. This marker is not an
application migration. Tests never create or modify it. A runtime preview has
no marker or purpose `preview`; a clone of an integration database requires a
distinct branch ID and cannot reuse the parent's marker unchanged. Tests must
never provision or repair a missing marker to make their own guard pass.

The opener performs only the marker SELECT before yielding its connection. Use
the returned postgres client to construct Drizzle with the application schema.
Close the client in `afterAll`. Tests exercising an outbox-wide worker must also
check the outbox has no preexisting foreign rows before enqueueing fixtures.
Run whole-database worker suites serially or on separate disposable branches.

## Fixture ownership

`createFixtureNamespace()` supplies unique nondeliverable emails and subjects.
`mockProviderIdentity()` returns the frozen normalized provider DTO, without
asserting that a production adapter authenticated it.

Register `FixtureLedger` cleanup callbacks in child-before-parent FK order.
Track exact UUIDs returned from this test's inserts, never IDs discovered from
unscoped database scans. Each callback must delete only its supplied IDs. Empty
domains are not invoked; duplicate IDs are deduplicated. A failure retains those
IDs and stops parent deletion so cleanup can be retried. The ledger cannot
prove ownership of arbitrary supplied IDs; safety depends on correct callers
and the independently marked disposable database.

## External effects

`createEffectRecorder<Input, Output>()` is a network-free async adapter double.
Register explicit test responses with `respondWith`; unconfigured calls throw
and remain recorded. `createMockExternalEffects()` groups email, audience,
billing, key, device, and mint recorders and exposes `assertNoCalls()` for denial
tests. Feed only synthetic values, never production tokens or contact records.

Run helper tests without credentials:

```sh
mise exec -- pnpm exec vitest run --config tests/support/vitest.config.ts tests/contracts/test-support.test.ts
```

The coordinator owns adding these contract tests to the primary Vitest config
and required CI checks. The support config exists for isolated specialist runs.
