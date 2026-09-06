import { describe, expect, it, vi } from "vitest";
import {
  executeDurableRun,
  type ExecutionDependencies,
} from "../../lib/runs/execute";
import type { RunDetail } from "../../lib/runs/types";
import type { McpPrincipal } from "../../lib/mcp/jwt";

const principal: McpPrincipal = {
  sub: "subject",
  externalUserId: "eu_test",
  publicClientId: "app",
  scope: "sign:job",
  token: "never-capture",
};
const owner = {
  principalId: "eu_test",
  userId: "user",
  externalAccountId: "account",
};
function fixture() {
  const run = { ...owner, id: "run_test" } as RunDetail;
  const deps: ExecutionDependencies = {
    store: {
      resolveRunOwner: vi.fn().mockResolvedValue(owner),
      createRun: vi.fn().mockResolvedValue(run),
      transitionRun: vi.fn().mockResolvedValue(run),
    },
    checkSpend: vi.fn().mockResolvedValue(undefined),
    describe: vi.fn().mockResolvedValue({ mode: "single-shot" }),
    infer: vi.fn().mockResolvedValue({
      gatewayRequestId: "job_test",
      data: { text: "hello" },
      status: null,
      url: null,
    }),
  };
  return deps;
}

describe("durable MCP execution", () => {
  it("records complete submitted JSON before any preflight or inference", async () => {
    const deps = fixture();
    const args = {
      capability: "text",
      inputs: { nested: { seed: 42 }, authorization: "secret" },
      prompt: "hello",
    };
    const reply = await executeDurableRun(principal, args, deps);
    expect(reply.payload.run_id).toBe("run_test");
    expect(deps.store.createRun).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        submittedArguments: {
          ...args,
          inputs: { nested: { seed: 42 }, authorization: "[REDACTED]" },
        },
      })
    );
    expect(
      vi.mocked(deps.store.createRun).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(deps.checkSpend).mock.invocationCallOrder[0]);
    expect(deps.store.transitionRun).toHaveBeenCalledWith(
      owner,
      "run_test",
      expect.objectContaining({
        status: "succeeded",
        result: expect.objectContaining({ value: { text: "hello" } }),
      })
    );
  });
  it("does not dispatch or check spend when initial persistence fails", async () => {
    const deps = fixture();
    vi.mocked(deps.store.createRun).mockRejectedValue(new Error("db"));
    expect(
      (await executeDurableRun(principal, { capability: "test" }, deps)).payload
        .error
    ).toBe("run_store_unavailable");
    expect(deps.checkSpend).not.toHaveBeenCalled();
    expect(deps.infer).not.toHaveBeenCalled();
  });
  it("rejects oversized arguments before database and execution", async () => {
    const deps = fixture();
    expect(
      (
        await executeDurableRun(
          principal,
          { capability: "test", prompt: "x".repeat(1024 * 1024) },
          deps
        )
      ).payload.error
    ).toBe("arguments_capture_limit");
    expect(deps.store.createRun).not.toHaveBeenCalled();
    expect(deps.infer).not.toHaveBeenCalled();
  });
  it("records preflight refusal against the saved run", async () => {
    const deps = fixture();
    vi.mocked(deps.checkSpend).mockRejectedValue(new Error("insufficient"));
    await executeDurableRun(principal, { capability: "test" }, deps);
    expect(deps.infer).not.toHaveBeenCalled();
    expect(deps.store.transitionRun).toHaveBeenCalledWith(
      owner,
      "run_test",
      expect.objectContaining({
        status: "failed",
        eventKey: "preflight-rejected",
      })
    );
  });
  it("never repeats paid execution when terminal storage fails", async () => {
    const deps = fixture();
    vi.mocked(deps.store.transitionRun).mockImplementation(
      async (_owner, _id, transition) => {
        if (transition.eventKey === "dispatch-returned") throw new Error("db");
        return { id: "run_test" } as RunDetail;
      }
    );
    const response = await executeDurableRun(
      principal,
      { capability: "test" },
      deps
    );
    expect(response.payload.persist_error).toBe("run_store_unavailable");
    expect(response.payload.data).toEqual({ text: "hello" });
    expect(deps.infer).toHaveBeenCalledTimes(1);
  });
  it("persists interrupted execution as unknown, not failed", async () => {
    const deps = fixture();
    vi.mocked(deps.infer).mockRejectedValue(new Error("timeout"));
    await executeDurableRun(principal, { capability: "test" }, deps);
    expect(deps.store.transitionRun).toHaveBeenCalledWith(
      owner,
      "run_test",
      expect.objectContaining({
        status: "unknown",
        errorCode: "execution_outcome_unknown",
      })
    );
  });
  it("retains public queue receipt for recovery without declaring success", async () => {
    const deps = fixture();
    vi.mocked(deps.infer).mockResolvedValue({
      data: { request_id: "id" },
      status: "IN_QUEUE",
      statusUrl: "https://queue.fal.run/fal-ai/model/requests/id/status",
      responseUrl: "https://queue.fal.run/fal-ai/model/requests/id",
      gatewayRequestId: "job_test",
    } as never);
    await executeDurableRun(principal, { capability: "test" }, deps);
    expect(deps.store.transitionRun).toHaveBeenCalledWith(
      owner,
      "run_test",
      expect.objectContaining({
        status: "running",
        queue: expect.objectContaining({
          statusUrl: "https://queue.fal.run/fal-ai/model/requests/id/status",
        }),
      })
    );
  });
  it.each(["IN_QUEUE", "COMPLETED"])(
    "keeps unsupported final queue handles unknown even when the provider says %s",
    async (status) => {
      const deps = fixture();
      vi.mocked(deps.infer).mockImplementation(async (request) => {
        await request.onProgress({
          status: "IN_PROGRESS",
          elapsedMs: 100,
          requestId: "old-request",
          statusUrl:
            "https://queue.fal.run/fal-ai/model/requests/old-request/status",
        });
        return {
          data: { request_id: "new-request" },
          status,
          statusUrl:
            "https://private-provider.example.invalid/queue/new-request",
          responseUrl:
            "https://private-provider.example.invalid/results/new-request",
          gatewayRequestId: request.gatewayRequestId,
        } as never;
      });
      await executeDurableRun(principal, { capability: "test" }, deps);
      const final = vi
        .mocked(deps.store.transitionRun)
        .mock.calls.find(
          ([, , change]) => change.eventKey === "dispatch-returned"
        )?.[2];
      expect(final).toMatchObject({
        status: "unknown",
        errorCode: "unsupported_queue_handle",
        stopReconciliation: "unsupported_final_queue_handle",
      });
      expect(final).not.toHaveProperty("queue");
      expect(deps.infer).toHaveBeenCalledTimes(1);
    }
  );
});
