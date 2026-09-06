/** One-shot operator-invoked development worker. Never dispatches inference. */
import { claimReconciliationJobs } from "../../lib/runs/store";
import { reconcileRunJob } from "../../lib/runs/reconcile";

const developmentTargets = new Map([
  [
    "br-holy-sound-auugm104",
    "ep-dry-smoke-au7l7dzw-pooler.c-10.us-east-1.aws.neon.tech",
  ],
]);

function assertTarget() {
  const branch = process.env.RUN_RECONCILE_BRANCH_ID;
  const expectedHost = branch ? developmentTargets.get(branch) : undefined;
  const explicitUrl = process.env.RUN_RECONCILE_DATABASE_URL;
  if (
    !expectedHost ||
    !explicitUrl ||
    process.env.RUN_RECONCILE_ACK !== "public-provider-reads-only"
  )
    throw new Error(
      "Explicit approved development branch and read-only-provider acknowledgement required."
    );
  const parsed = new URL(explicitUrl);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname !== expectedHost ||
    parsed.pathname !== "/neondb" ||
    (parsed.port !== "" && parsed.port !== "5432") ||
    [...parsed.searchParams.keys()].some(
      (key) => !["sslmode", "channel_binding"].includes(key)
    ) ||
    parsed.hash
  )
    throw new Error(
      "Development database target does not match its approved branch."
    );
  process.env.DATABASE_URL = explicitUrl;
}

async function main() {
  assertTarget();
  const jobs = await claimReconciliationJobs(10);
  let completed = 0;
  for (const job of jobs) {
    try {
      await reconcileRunJob(job);
      completed++;
    } catch {
      /* A failed DB write leaves the lease retryable; do not log payloads. */
    }
  }
  console.log(
    JSON.stringify({
      claimed: jobs.length,
      processed: completed,
      providerOperations: "GET only",
      dispatchedInference: 0,
    })
  );
}

void main().then(
  () => process.exit(0),
  () => {
    console.error(
      "Development run reconciliation failed; no inference was dispatched."
    );
    process.exit(1);
  }
);
