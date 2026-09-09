import { describe, expect, it, vi } from "vitest";
import {
  executeDurableRun,
  type ExecutionDependencies,
} from "@/lib/runs/execute";
import type { RunDetail } from "@/lib/runs/types";
import {
  captureJson,
  captureResult,
  CaptureLimitError,
  MAX_CAPTURE_BYTES,
} from "@/lib/runs/capture";
import { extractRunOutputs } from "@/lib/runs/outputs";
import { validatePublicFalQueue } from "@/lib/runs/reconcile";

describe("run capture privacy contract", () => {
  it("preserves the complete nested JSON shape and optional input fields", () => {
    const args = {
      capability: "fal-ai/flux",
      inputs: {
        prompt: "A lighthouse",
        seed: 42,
        negative_prompt: "rain",
        options: [null, false, 1.5, { width: 1024 }],
      },
      prompt: "Separate prompt",
      endpoint: "/generate",
    };
    expect(captureJson(args).value).toEqual(args);
    expect(args.inputs.prompt).toBe("A lighthouse");
  });

  it("redacts credentials recursively, including common submitted header names", () => {
    const captured = captureJson({
      capability: "test",
      inputs: {
        headers: {
          Authorization: "Bearer fixture-secret-one",
          "x-api-key": "fixture-secret-two",
          Cookie: "session=fixture-secret-three",
        },
        nested: [
          {
            client_secret: "fixture-secret-four",
            refreshToken: "fixture-secret-five",
          },
        ],
        prompt: "Keep my ordinary prompt",
      },
    });
    expect(JSON.stringify(captured.value)).not.toContain("fixture-secret");
    expect(JSON.stringify(captured.value)).toContain("Keep my ordinary prompt");
    expect(captured.metadata.redactedPaths).toContain(
      "/inputs/headers/x-api-key"
    );
  });

  it("redacts signed URL credentials but preserves useful nonsecret file parameters", () => {
    const captured = captureJson({
      inputs: {
        url: "https://user:fixture-secret@example.invalid/image.png?width=100&X-Amz-Signature=fixture-secret&token=fixture-secret",
      },
    });
    expect(JSON.stringify(captured.value)).not.toContain("fixture-secret");
    expect(JSON.stringify(captured.value)).toContain("width=100");
    expect(captured.metadata.redactedPaths).toContain("/inputs/url");
  });

  it("omits embedded media without mutating the submitted object", () => {
    const args = {
      inputs: {
        image: "data:image/png;base64,ZmFrZQ==",
        audio_base64: "ZmFrZQ==",
        options: { prompt: "Keep" },
      },
    };
    const captured = captureJson(args);
    expect(JSON.stringify(captured.value)).not.toContain("ZmFrZQ==");
    expect(captured.metadata.omittedPaths).toEqual([
      "/inputs/image",
      "/inputs/audio_base64",
    ]);
    expect(args.inputs.image).toContain("ZmFrZQ==");
  });

  it("redacts signed links embedded in prompt text and omits non-base64 data URLs", () => {
    const captured = captureJson({
      inputs: {
        prompt:
          "Use https://example.invalid/a.png?signature=fixture-secret as reference",
        image: "data:image/svg+xml,%3Csvg%3Eembedded-media%3C%2Fsvg%3E",
      },
    });
    expect(JSON.stringify(captured.value)).not.toContain("fixture-secret");
    expect(JSON.stringify(captured.value)).not.toContain("embedded-media");
    expect(captured.metadata.omittedPaths).toContain("/inputs/image");
  });

  it("enforces byte and depth limits before redaction can hide oversized content", () => {
    expect(() =>
      captureJson({ password: "x".repeat(MAX_CAPTURE_BYTES) })
    ).toThrow(CaptureLimitError);
    let value: unknown = "leaf";
    for (let i = 0; i < 33; i++) value = { nested: value };
    expect(() => captureJson({ password: value })).toThrow(CaptureLimitError);
  });

  it("retains all JSON result kinds and explicitly omits oversized results", () => {
    for (const value of [
      null,
      false,
      42,
      "hello",
      [1, { text: "yes" }],
      { text: "hello" },
    ]) {
      expect(captureResult(value).value).toEqual(value);
    }
    const captured = captureResult({ text: "x".repeat(MAX_CAPTURE_BYTES) });
    expect(captured.value).toBeNull();
    expect(captured.omitted).toBeTruthy();
  });

  it("extracts all recognized outputs once without accepting queue handles as media", () => {
    const outputs = extractRunOutputs({
      images: [
        { url: "https://v3.fal.media/files/a.png" },
        { url: "https://v3.fal.media/files/b.png" },
      ],
      image: { url: "https://v3.fal.media/files/a.png" },
      video: { url: "https://v3.fal.media/files/c.mp4" },
      video_urls: [
        "https://v3.fal.media/files/d.mp4",
        "https://v3.fal.media/files/e.mp4",
      ],
      status_url: "https://queue.fal.run/fal-ai/flux/requests/request-1/status",
      prompt: "https://example.invalid/not-an-output.png",
    });
    expect(outputs.map((item) => item.url)).toEqual([
      "https://v3.fal.media/files/a.png",
      "https://v3.fal.media/files/c.mp4",
      "https://v3.fal.media/files/b.png",
      "https://v3.fal.media/files/d.mp4",
      "https://v3.fal.media/files/e.mp4",
    ]);
    expect(
      extractRunOutputs({
        image: { url: "https://example.invalid/a?token=fixture-secret" },
      })
    ).toEqual([]);
  });
});

describe("public fal recovery URL boundary", () => {
  const status = "https://queue.fal.run/fal-ai/flux/requests/request-1/status";
  const result = "https://queue.fal.run/fal-ai/flux/requests/request-1";
  it("accepts only the matching public status/result pair", () => {
    expect(validatePublicFalQueue(status, result)).toEqual({
      statusUrl: status,
      resultUrl: result,
    });
  });
  it.each([
    "http://queue.fal.run/fal-ai/flux/requests/request-1/status",
    "https://queue.fal.run.evil.invalid/fal-ai/flux/requests/request-1/status",
    "https://queue.fal.run@127.0.0.1/fal-ai/flux/requests/request-1/status",
    "https://user:password@queue.fal.run/fal-ai/flux/requests/request-1/status",
    "https://queue.fal.run:8443/fal-ai/flux/requests/request-1/status",
    "https://queue.fal.run/fal-ai/flux/requests/request-1/status?token=secret",
    "https://queue.fal.run/fal-ai/flux/requests/request-1/status#fragment",
    "https://queue.fal.run/fal-ai/flux/requests/%2e%2e/status",
    "https://queue.fal.run/fal-ai/flux/requests/request-1/cancel",
    "https://localhost/fal-ai/flux/requests/request-1/status",
  ])("rejects unsafe status handle %s", (url) => {
    expect(validatePublicFalQueue(url, result)).toBeNull();
  });
  it("rejects a valid result URL for a different request or model", () => {
    expect(
      validatePublicFalQueue(status, result.replace("request-1", "request-2"))
    ).toBeNull();
    expect(
      validatePublicFalQueue(status, result.replace("flux", "other"))
    ).toBeNull();
  });
});

it("keeps a late queue receipt despite repeated provider status and broken client notifications", async () => {
  const owner = {
    principalId: "eu_test",
    userId: "user",
    externalAccountId: "account",
  };
  const record = { ...owner, id: "run-test" } as RunDetail;
  const store = {
    resolveRunOwner: vi.fn().mockResolvedValue(owner),
    createRun: vi.fn().mockResolvedValue(record),
    transitionRun: vi.fn().mockResolvedValue(record),
  };
  const deps: ExecutionDependencies = {
    store,
    checkSpend: async () => {},
    describe: async () => ({ mode: "single-shot" }),
    onProgress: vi.fn().mockRejectedValue(new Error("client disconnected")),
    infer: vi.fn(
      async ({ onProgress }: Parameters<ExecutionDependencies["infer"]>[0]) => {
        await onProgress({
          status: "IN_QUEUE",
          requestId: "request-1",
          elapsedMs: 1,
        } as never);
        await onProgress({
          status: "IN_QUEUE",
          requestId: "request-1",
          elapsedMs: 2,
          statusUrl:
            "https://queue.fal.run/fal-ai/flux/requests/request-1/status",
        } as never);
        return {
          data: { text: "completed" },
          status: "COMPLETED",
          gatewayRequestId: "gateway",
        } as never;
      }
    ),
  };
  const result = await executeDurableRun(
    {
      sub: "subject",
      externalUserId: "eu_test",
      publicClientId: "app",
      scope: "sign:job",
      token: "never-capture",
    },
    { capability: "fal-ai/flux" },
    deps
  );
  const progress = store.transitionRun.mock.calls
    .map((call) => call[2])
    .filter((change) => change.eventKey.startsWith("progress:"));
  expect(progress).toHaveLength(2);
  expect(progress[0].eventKey).not.toBe(progress[1].eventKey);
  expect(progress[1]).toMatchObject({
    status: "running",
    queue: {
      statusUrl: "https://queue.fal.run/fal-ai/flux/requests/request-1/status",
    },
  });
  expect(result.isError).toBe(false);
  expect(deps.infer).toHaveBeenCalledTimes(1);
});
