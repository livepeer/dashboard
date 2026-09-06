/** Production execution intentionally unavailable in this build. */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { openIntegrationDatabase } from "../../tests/support/isolated-db";
import { reconcileManifest } from "./reconcile";
import type { GrandfatherManifest } from "./manifest";

const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    "reviewed-checksum": { type: "string" },
    "apply-isolated": { type: "boolean", default: false },
  },
});
async function main() {
  if (!values.manifest || !values["reviewed-checksum"])
    throw new Error("--manifest and --reviewed-checksum required");
  const manifest = JSON.parse(
    readFileSync(values.manifest, "utf8")
  ) as GrandfatherManifest;
  // No fallback to DATABASE_URL, no override permitting production.
  const { client } = await openIntegrationDatabase({
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    TEST_DATABASE_HOST: process.env.TEST_DATABASE_HOST,
    TEST_DATABASE_BRANCH_ID: process.env.TEST_DATABASE_BRANCH_ID,
  });
  try {
    const result = await reconcileManifest(client, manifest, {
      reviewedChecksum: values["reviewed-checksum"],
      apply: values["apply-isolated"],
    });
    console.log(
      JSON.stringify({
        mode: values["apply-isolated"] ? "isolated-apply" : "dry-run",
        committed: !!values["apply-isolated"] && !result.blockers,
        ...result,
      })
    );
    if (result.blockers) process.exitCode = 2;
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error(
    "Backfill failed safely; no customer records or connection details printed."
  );
  process.exitCode = 1;
});
