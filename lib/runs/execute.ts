import type { InferenceResult, QueueProgress } from "@pymthouse/gateway-web";
import { isQueueControlUrl } from "@pymthouse/gateway-web";
import type { McpPrincipal } from "@/lib/mcp/jwt";
import { principalId } from "@/lib/mcp/log";
import {
  runCapabilityFailurePayload,
  validateRunCapabilityEndpoint,
} from "@/lib/mcp/run-capability";
import { captureJson, CaptureLimitError } from "./capture";
import { extractRunOutputs } from "./outputs";
import {
  observedRunStatus,
  resultEnvelope,
  validatePublicFalQueue,
} from "./reconcile";
import type { JsonValue, RunDetail, RunTransition } from "./types";

export type RunArguments = {
  capability: string;
  inputs?: Record<string, unknown>;
  prompt?: string;
  endpoint?: string;
};
export type ExecutionDependencies = {
  store: Pick<
    typeof import("./store"),
    "resolveRunOwner" | "createRun" | "transitionRun"
  >;
  checkSpend: () => Promise<void>;
  describe: () => Promise<{ mode?: string } | null>;
  infer: (request: {
    capability: string;
    params: Record<string, unknown>;
    prompt?: string;
    endpoint?: string;
    timeoutMs: number;
    gatewayRequestId: string;
    onProgress: (info: QueueProgress) => Promise<void>;
  }) => Promise<InferenceResult>;
  onProgress?: (info: QueueProgress) => Promise<void>;
};

/** Persist retries never contain or repeat inference dispatch. */
async function recordWithRetry(
  fn: () => Promise<RunDetail>
): Promise<RunDetail | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch {
      if (attempt < 2)
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * (attempt + 1))
        );
    }
  }
  return null;
}

export async function executeDurableRun(
  principal: McpPrincipal,
  args: RunArguments,
  deps: ExecutionDependencies
): Promise<{ payload: Record<string, unknown>; isError: boolean }> {
  let captured;
  try {
    captured = captureJson(args);
  } catch (error) {
    return {
      payload: {
        error:
          error instanceof CaptureLimitError
            ? "arguments_capture_limit"
            : "invalid_arguments",
      },
      isError: true,
    };
  }
  const gatewayRequestId = `job_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  let run: RunDetail;
  let owner;
  try {
    owner = await deps.store.resolveRunOwner(principalId(principal));
    run = await deps.store.createRun(owner, {
      gatewayRequestId,
      capability: args.capability,
      endpoint: args.endpoint,
      submittedArguments: captured.value as Record<string, JsonValue>,
      captureVersion: captured.metadata.version,
      captureRedactedPaths: [
        ...captured.metadata.redactedPaths,
        ...captured.metadata.omittedPaths,
      ],
    });
  } catch {
    return {
      payload: {
        error: "run_store_unavailable",
        message: "The run could not be saved; no execution was dispatched.",
      },
      isError: true,
    };
  }
  const record = (change: RunTransition) =>
    recordWithRetry(() => deps.store.transitionRun(owner, run.id, change));
  let mode: string | undefined;
  try {
    await deps.checkSpend();
    const row = await deps.describe();
    mode = row?.mode;
    const endpointError = validateRunCapabilityEndpoint(
      args.capability,
      row,
      args.endpoint
    );
    if (endpointError) {
      const saved = await record({
        eventKey: "preflight-rejected",
        status: "failed",
        errorCode: endpointError.error,
        errorMessage: endpointError.message,
      });
      return {
        payload: {
          ...endpointError,
          run_id: run.id,
          gateway_request_id: gatewayRequestId,
          ...(!saved ? { persist_error: "run_store_unavailable" } : {}),
        },
        isError: true,
      };
    }
    const started = await record({
      eventKey: "dispatch-started",
      status: "running",
    });
    if (!started)
      return {
        payload: {
          run_id: run.id,
          gateway_request_id: gatewayRequestId,
          error: "run_store_unavailable",
          message: "No execution was dispatched.",
        },
        isError: true,
      };
  } catch (error) {
    const saved = await record({
      eventKey: "preflight-rejected",
      status: "failed",
      errorCode: "preflight_rejected",
      errorMessage: "Spend authorization or discovery did not permit dispatch.",
    });
    return {
      payload: {
        ...runCapabilityFailurePayload(error, gatewayRequestId),
        run_id: run.id,
        ...(!saved ? { persist_error: "run_store_unavailable" } : {}),
      },
      isError: true,
    };
  }

  let lastQueue: ReturnType<typeof validatePublicFalQueue> = null;
  let providerRequestId: string | undefined;
  let progressWrites = Promise.resolve();
  try {
    const result = await deps.infer({
      capability: args.capability,
      params: args.inputs ?? {},
      prompt: args.prompt,
      endpoint: mode === "persistent" ? args.endpoint : undefined,
      timeoutMs: 780_000,
      gatewayRequestId,
      onProgress: async (info) => {
        providerRequestId = info.requestId ?? providerRequestId;
        lastQueue = validatePublicFalQueue(info.statusUrl) ?? lastQueue;
        const queue = lastQueue;
        progressWrites = progressWrites.then(async () => {
          // A progress notification is not a terminal response.
          await record({
            eventKey: `progress:${info.status}:${info.requestId ?? ""}:${queue?.statusUrl ?? "no-receipt"}`,
            status: "running",
            metadata: { providerStatus: info.status },
            providerRequestId,
            ...(queue ? { queue, provider: "fal" } : {}),
          });
        });
        try {
          await deps.onProgress?.(info);
        } catch {
          /* Client notification failure must not interrupt execution. */
        }
      },
    });
    await progressWrites;
    const hasQueue = Boolean(result.statusUrl || result.responseUrl);
    // An explicit unsupported final receipt must not fall back to a previously
    // observed handle: a retried provider may have minted a different request.
    const queue = hasQueue
      ? validatePublicFalQueue(result.statusUrl, result.responseUrl)
      : lastQueue;
    const observed = observedRunStatus(result.status, hasQueue);
    const status =
      hasQueue && !queue
        ? "unknown"
        : observed === "queued"
          ? "running"
          : observed;
    const outputs = extractRunOutputs(result);
    const provider =
      queue || args.capability.startsWith("fal-ai/") ? "fal" : undefined;
    const saved = await record({
      eventKey: "dispatch-returned",
      status,
      provider,
      providerRequestId: result.providerRequestId ?? providerRequestId,
      result: resultEnvelope(result.data),
      ...(status === "succeeded"
        ? { errorCode: null, errorMessage: null }
        : {}),
      assets: outputs.map((asset) => ({
        url: asset.url,
        mediaType: asset.mediaKind,
        providerRequestId: result.providerRequestId,
      })),
      metadata: { providerStatus: result.status ?? null },
      ...(queue && !["succeeded", "failed", "cancelled"].includes(status)
        ? { queue }
        : {}),
      ...(hasQueue && !queue
        ? {
            errorCode: "unsupported_queue_handle",
            stopReconciliation: "unsupported_final_queue_handle",
          }
        : {}),
    });
    const urlRaw =
      result.url ?? result.imageUrl ?? result.videoUrl ?? result.audioUrl;
    const url = urlRaw && !isQueueControlUrl(urlRaw) ? urlRaw : null;
    return {
      payload: {
        capability: args.capability,
        url,
        status: result.status,
        request_id: result.providerRequestId,
        status_url: result.statusUrl,
        response_url: result.responseUrl,
        orchestrator: result.orchestrator,
        elapsed_ms: result.elapsedMs,
        billable_units: result.billableUnits,
        gateway_request_id: result.gatewayRequestId || gatewayRequestId,
        run_id: run.id,
        ...(!saved ? { persist_error: "run_store_unavailable" } : {}),
        ...(url ? {} : { data: result.data }),
      },
      isError: status === "failed" || status === "cancelled",
    };
  } catch (error) {
    await progressWrites;
    const saved = await record({
      eventKey: "dispatch-interrupted",
      status: "unknown",
      providerRequestId,
      errorCode: "execution_outcome_unknown",
      errorMessage:
        "Execution was interrupted after dispatch; the provider outcome is not confirmed.",
      ...(lastQueue ? { queue: lastQueue, provider: "fal" } : {}),
    });
    return {
      payload: {
        ...runCapabilityFailurePayload(error, gatewayRequestId),
        run_id: run.id,
        ...(!saved ? { persist_error: "run_store_unavailable" } : {}),
      },
      isError: true,
    };
  }
}
