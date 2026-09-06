import { describe, expect, it, vi } from "vitest";
import { reconcileRunJob } from "../../lib/runs/reconcile";
import type { ReconciliationJob, RunDetail } from "../../lib/runs/types";

const job: ReconciliationJob = {
  id: "job",
  runId: "run",
  owner: { principalId: "p", userId: "u", externalAccountId: "e" },
  leaseToken: "lease",
  attempts: 1,
  deadlineAt: new Date(Date.now() + 3600000).toISOString(),
  queue: {
    statusUrl: "https://queue.fal.run/fal-ai/model/requests/id/status",
    resultUrl: "https://queue.fal.run/fal-ai/model/requests/id",
  },
};
function fixture() {
  return {
    store: {
      transitionRun: vi.fn().mockResolvedValue({ id: "run" } as RunDetail),
      releaseReconciliationJob: vi.fn().mockResolvedValue(undefined),
    },
    fetcher: vi.fn<typeof fetch>(),
  };
}

describe("public queue recovery", () => {
  it("only GETs exact status and result then atomically records all outputs", async () => {
    const deps = fixture();
    deps.fetcher
      .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(
        Response.json({
          images: [
            { url: "https://media.fal.media/a.png" },
            { url: "https://media.fal.media/b.png" },
          ],
        })
      );
    await reconcileRunJob(job, deps);
    expect(deps.fetcher).toHaveBeenCalledTimes(2);
    for (const [, options] of deps.fetcher.mock.calls)
      expect(options).toEqual(
        expect.objectContaining({
          method: "GET",
          redirect: "error",
          headers: { Accept: "application/json" },
        })
      );
    expect(deps.store.transitionRun).toHaveBeenCalledWith(
      job.owner,
      "run",
      expect.objectContaining({
        status: "succeeded",
        assets: [
          { url: "https://media.fal.media/a.png", mediaType: "image" },
          { url: "https://media.fal.media/b.png", mediaType: "image" },
        ],
      })
    );
    expect(deps.store.releaseReconciliationJob).toHaveBeenCalledWith(job, {
      done: true,
    });
  });
  it("unknown provider statuses remain unknown and retry, not success", async () => {
    const deps = fixture();
    deps.fetcher.mockResolvedValue(Response.json({ status: "SOMETHING_NEW" }));
    await reconcileRunJob(job, deps);
    expect(deps.fetcher).toHaveBeenCalledTimes(1);
    expect(deps.store.transitionRun).toHaveBeenCalledWith(
      job.owner,
      "run",
      expect.objectContaining({ status: "unknown" })
    );
    expect(deps.store.releaseReconciliationJob).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ done: false })
    );
  });
  it("inaccessible endpoints record unknown and retry without credentials", async () => {
    const deps = fixture();
    deps.fetcher.mockResolvedValue(new Response("denied", { status: 401 }));
    await reconcileRunJob(job, deps);
    expect(deps.store.transitionRun).toHaveBeenCalledWith(
      job.owner,
      "run",
      expect.objectContaining({
        status: "unknown",
        errorCode: "queue_unavailable",
      })
    );
  });
  it("stops at the recovery horizon without networking", async () => {
    const deps = fixture();
    await reconcileRunJob({ ...job, deadlineAt: "2000-01-01T00:00:00Z" }, deps);
    expect(deps.fetcher).not.toHaveBeenCalled();
    expect(deps.store.transitionRun).toHaveBeenCalledWith(
      job.owner,
      "run",
      expect.objectContaining({
        status: "unknown",
        errorCode: "recovery_horizon_elapsed",
      })
    );
  });
  it("rejects forged database queue URLs without networking", async () => {
    const deps = fixture();
    await reconcileRunJob(
      {
        ...job,
        queue: {
          statusUrl: "http://127.0.0.1/private",
          resultUrl: "http://127.0.0.1/private",
        },
      },
      deps
    );
    expect(deps.fetcher).not.toHaveBeenCalled();
  });
  it("limits response bytes even without Content-Length", async () => {
    const deps = fixture();
    deps.fetcher.mockResolvedValue(new Response("x".repeat(1024 * 1024 + 1)));
    await reconcileRunJob(job, deps);
    expect(deps.store.transitionRun).toHaveBeenCalledWith(
      job.owner,
      "run",
      expect.objectContaining({
        status: "unknown",
        errorCode: "queue_unavailable",
      })
    );
  });
  it("fences every recovery write with the claimed lease and abandons stale completion", async () => {
    const deps = fixture();
    deps.fetcher
      .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(
        Response.json({ images: [{ url: "https://media.fal.media/old.png" }] })
      );
    deps.store.transitionRun.mockRejectedValue(
      new Error("run_reconciliation_lease_lost")
    );
    await reconcileRunJob(job, deps);
    expect(deps.store.transitionRun).toHaveBeenCalledTimes(1);
    expect(deps.store.transitionRun).toHaveBeenCalledWith(
      job.owner,
      "run",
      expect.objectContaining({
        reconciliationLease: { jobId: job.id, leaseToken: job.leaseToken },
      })
    );
    expect(deps.store.releaseReconciliationJob).not.toHaveBeenCalled();
  });
});
