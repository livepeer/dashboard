import postgres from "postgres";

/** Never populate these values from DATABASE_URL or an application env file. */
export type IntegrationDatabaseEnv = {
  [key: string]: string | undefined;
  TEST_DATABASE_URL?: string;
  TEST_DATABASE_HOST?: string;
  TEST_DATABASE_BRANCH_ID?: string;
};

export type IntegrationDatabaseTarget = {
  hostname: string;
  branchId: string;
};

export type IntegrationDatabaseMarker = {
  branchId: string;
  purpose: "integration";
};

const forbiddenEndpointNames = [
  "ep-mute-dust-au81hdx5", // production
  "ep-super-smoke-au3eh6hd", // original user-test preview
  "ep-dry-smoke-au7l7dzw", // early-access runtime preview
];

/** Validation output is deliberately credential-free and safe to log. */
export function readIntegrationDatabaseTarget(
  env: IntegrationDatabaseEnv,
  options: { forbiddenHosts?: readonly string[] } = {}
): IntegrationDatabaseTarget {
  const expectedHost = env.TEST_DATABASE_HOST?.trim().toLowerCase();
  const branchId = env.TEST_DATABASE_BRANCH_ID?.trim();
  if (!env.TEST_DATABASE_URL || !expectedHost || !branchId) {
    throw new Error(
      "Integration tests require an explicit URL, host, and branch ID"
    );
  }
  let url: URL;
  try {
    url = new URL(env.TEST_DATABASE_URL);
  } catch {
    throw new Error("Invalid integration database URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== expectedHost ||
    !/^br-[a-z0-9-]+$/.test(branchId)
  ) {
    throw new Error("Integration database target does not match its approval");
  }
  const endpointName = url.hostname.split(".")[0].replace(/-pooler$/, "");
  const forbiddenHosts = (options.forbiddenHosts ?? []).map((host) =>
    host
      .trim()
      .toLowerCase()
      .replace(/-pooler(?=\.|$)/, "")
  );
  if (
    forbiddenEndpointNames.includes(endpointName) ||
    forbiddenHosts.includes(url.hostname.replace(/-pooler(?=\.|$)/, ""))
  ) {
    throw new Error(
      "Production and runtime preview databases are forbidden for tests"
    );
  }
  return { hostname: url.hostname, branchId };
}

/** Marker must be provisioned separately by the coordinator, never by tests. */
export function assertIntegrationDatabaseMarker(
  target: IntegrationDatabaseTarget,
  rows: readonly unknown[]
): asserts rows is readonly IntegrationDatabaseMarker[] {
  const marker = rows[0];
  if (
    rows.length !== 1 ||
    typeof marker !== "object" ||
    marker === null ||
    !("branchId" in marker) ||
    marker.branchId !== target.branchId ||
    !("purpose" in marker) ||
    marker.purpose !== "integration"
  ) {
    throw new Error(
      "Database is not marked for this disposable integration branch"
    );
  }
}

/**
 * Opens no connection until URL/host/branch checks pass. The marker SELECT is
 * the only operation before authorization; missing/wrong markers fail closed.
 * Runtime previews must have no marker, or purpose = 'preview'.
 */
export async function openIntegrationDatabase(
  env: IntegrationDatabaseEnv,
  options: { forbiddenHosts?: readonly string[] } = {}
) {
  const target = readIntegrationDatabaseTarget(env, options);
  const client = postgres(env.TEST_DATABASE_URL!, {
    max: 4,
    prepare: false,
    connect_timeout: 10,
    connection: { statement_timeout: 10000 },
  });
  try {
    const rows = await client`
      SELECT branch_id AS "branchId", purpose FROM console_test_guard
    `;
    assertIntegrationDatabaseMarker(target, rows);
    return { client, target };
  } catch {
    await client.end({ timeout: 1 }).catch(() => undefined);
    // Driver errors may contain connection details; never forward their text.
    throw new Error(
      "Could not validate the disposable integration database marker"
    );
  }
}
