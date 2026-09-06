/** Coordinator-only, explicit read-only request to one PymtHouse app. */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { PmtHouseClient } from "@pymthouse/builder-sdk";
import { checksum, inventorySchema, normalizeIssuer } from "./manifest";

const { values } = parseArgs({
  options: {
    fetch: { type: "boolean", default: false },
    issuer: { type: "string" },
    "app-id": { type: "string" },
    output: { type: "string" },
  },
});
if (!values.fetch || !values.issuer || !values["app-id"] || !values.output)
  throw new Error(
    "No request made. Explicit --fetch --issuer URL --app-id ID --output private.json required."
  );

async function main() {
  const m2mClientId = process.env.PYMTHOUSE_M2M_CLIENT_ID;
  const m2mClientSecret = process.env.PYMTHOUSE_M2M_CLIENT_SECRET;
  if (!m2mClientId || !m2mClientSecret)
    throw new Error("Missing inventory credentials");
  const issuer = normalizeIssuer(values.issuer!);
  if (!issuer.startsWith("https://")) throw new Error("HTTPS issuer required");
  const client = new PmtHouseClient({
    issuerUrl: issuer,
    publicClientId: values["app-id"]!,
    m2mClientId,
    m2mClientSecret,
  });
  const inventory = inventorySchema.parse(await client.listAppUsers());
  if (inventory.users.some((row) => row.clientId !== values["app-id"]))
    throw new Error("Returned inventory contains another app");
  writeFileSync(values.output!, JSON.stringify(inventory, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      mode: "read-only",
      records: inventory.users.length,
      checksum: checksum(inventory),
    })
  );
}
main().catch(() => {
  console.error(
    "Inventory read failed. No credentials or customer records printed."
  );
  process.exitCode = 1;
});
