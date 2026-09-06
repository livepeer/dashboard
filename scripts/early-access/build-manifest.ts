/** Local read-only planning; no database or API calls. Full output is private. */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildGrandfatherManifest, manifestSummary } from "./manifest";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
  },
});
if (!values.input || !values.output)
  throw new Error(
    "Required: --input private-input.json --output private-manifest.json"
  );
try {
  const manifest = buildGrandfatherManifest(
    JSON.parse(readFileSync(values.input, "utf8"))
  );
  // Exclusive create avoids overwriting any previously reviewed private manifest.
  writeFileSync(values.output, JSON.stringify(manifest, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  console.log(JSON.stringify(manifestSummary(manifest)));
  if (manifest.unresolved.length) process.exitCode = 2;
} catch {
  console.error(
    "Manifest generation failed; check private input shape and output path. No customer records printed."
  );
  process.exitCode = 1;
}
