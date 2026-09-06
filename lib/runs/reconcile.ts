import type {
  CapturedResult,
  JsonValue,
  ReconciliationJob,
  RunQueue,
  RunStatus,
} from "./types";
import { captureResult } from "./capture";
import { extractRunOutputs } from "./outputs";

export function validatePublicFalQueue(
  statusUrl: unknown,
  resultUrl?: unknown
): RunQueue | null {
  if (typeof statusUrl !== "string") return null;
  try {
    const status = new URL(statusUrl);
    if (
      status.protocol !== "https:" ||
      status.hostname !== "queue.fal.run" ||
      status.port ||
      status.username ||
      status.password ||
      status.search ||
      status.hash
    )
      return null;
    if (
      !/^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/requests\/[A-Za-z0-9_-]+\/status$/.test(
        status.pathname
      )
    )
      return null;
    const expected = status.href.slice(0, -"/status".length);
    if (resultUrl != null && resultUrl !== expected) return null;
    return { statusUrl: status.href, resultUrl: expected };
  } catch {
    return null;
  }
}

export function resultEnvelope(value: unknown): CapturedResult {
  const captured = captureResult(value);
  return {
    value: captured.value as JsonValue,
    ...(captured.omitted ? { omitted: { reason: captured.omitted } } : {}),
    redactedPaths: [
      ...captured.capture.redactedPaths,
      ...captured.capture.omittedPaths,
    ],
  };
}

export function observedRunStatus(
  status: unknown,
  hasQueue: boolean
): RunStatus {
  const normalized = typeof status === "string" ? status.toUpperCase() : "";
  if (["FAILED", "ERROR"].includes(normalized)) return "failed";
  if (["CANCELLED", "CANCELED"].includes(normalized)) return "cancelled";
  if (["IN_QUEUE", "QUEUED", "PENDING"].includes(normalized)) return "queued";
  if (["IN_PROGRESS", "RUNNING", "PROCESSING"].includes(normalized))
    return "running";
  if (["COMPLETED", "SUCCEEDED", "SUCCESS"].includes(normalized))
    return "succeeded";
  return hasQueue || normalized ? "unknown" : "succeeded";
}

async function readPublicQueueJson(
  url: string,
  fetcher: typeof fetch
): Promise<unknown> {
  const response = await fetcher(url, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok || !response.body) throw new Error("queue_unavailable");
  const declaredLength = Number(response.headers.get("content-length"));
  if (declaredLength > 1024 * 1024) {
    await response.body.cancel();
    throw new Error("queue_response_too_large");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        throw new Error("queue_response_too_large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function reconcileRunJob(
  job: ReconciliationJob,
  deps?: {
    fetcher?: typeof fetch;
    store?: Pick<
      typeof import("./store"),
      "transitionRun" | "releaseReconciliationJob"
    >;
  }
): Promise<void> {
  const store = deps?.store ?? (await import("./store"));
  const reconciliationLease = { jobId: job.id, leaseToken: job.leaseToken };
  const queue = validatePublicFalQueue(
    job.queue.statusUrl,
    job.queue.resultUrl
  );
  if (!queue || Date.parse(job.deadlineAt) <= Date.now()) {
    await store.transitionRun(job.owner, job.runId, {
      reconciliationLease,
      eventKey: `recovery-stop:${job.id}`,
      status: "unknown",
      errorCode: queue
        ? "recovery_horizon_elapsed"
        : "unsupported_queue_handle",
    });
    await store.releaseReconciliationJob(job, {
      done: true,
      reason: queue ? "recovery_horizon_elapsed" : "unsupported_queue_handle",
    });
    return;
  }
  try {
    const response = await readPublicQueueJson(
      queue.statusUrl,
      deps?.fetcher ?? fetch
    );
    const status = observedRunStatus(
      response && typeof response === "object"
        ? (response as Record<string, unknown>).status
        : null,
      true
    );
    if (status === "succeeded") {
      const output = await readPublicQueueJson(
        queue.resultUrl,
        deps?.fetcher ?? fetch
      );
      await store.transitionRun(job.owner, job.runId, {
        reconciliationLease,
        eventKey: "provider-completed",
        status: "succeeded",
        provider: "fal",
        errorCode: null,
        errorMessage: null,
        result: resultEnvelope(output),
        assets: extractRunOutputs(output).map((asset) => ({
          url: asset.url,
          mediaType: asset.mediaKind,
        })),
      });
      await store.releaseReconciliationJob(job, { done: true });
    } else if (status === "failed" || status === "cancelled") {
      await store.transitionRun(job.owner, job.runId, {
        reconciliationLease,
        eventKey: "provider-completed",
        status,
        result: resultEnvelope(response),
      });
      await store.releaseReconciliationJob(job, { done: true });
    } else {
      await store.transitionRun(job.owner, job.runId, {
        reconciliationLease,
        eventKey: `recovery:${job.id}:${job.leaseToken}:${job.attempts}`,
        status: status === "queued" ? "running" : status,
      });
      await store.releaseReconciliationJob(job, {
        done: false,
        retryAfterSeconds: Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8)),
      });
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "run_reconciliation_lease_lost"
    )
      return;
    await store.transitionRun(job.owner, job.runId, {
      reconciliationLease,
      eventKey: `recovery-unavailable:${job.id}:${job.leaseToken}:${job.attempts}`,
      status: "unknown",
      errorCode: "queue_unavailable",
    });
    await store.releaseReconciliationJob(job, {
      done: false,
      reason: "queue_read_or_persistence_unavailable",
      retryAfterSeconds: Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8)),
    });
  }
}
