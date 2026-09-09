import type { JsonValue, RunDetail, RunSummary } from "@/lib/runs/types";
import type { AccountActivityRow } from "./types";
import { resolveActivityCapability } from "./capability-modality";
import {
  requestFeeDisplay,
  type RequestFeeFields,
} from "./request-fee-display";
import { humanizePipelineModel } from "./usage-capability-display";

export type RunActivityFee = {
  costDisplay: string;
  costExact?: string;
};

function isRequestFeeFields(
  fee: RequestFeeFields | RunActivityFee
): fee is RequestFeeFields {
  return "networkFeeUsdMicros" in fee;
}

function costFromFee(
  fee: RequestFeeFields | RunActivityFee | null | undefined
): RunActivityFee | null {
  if (!fee || typeof fee !== "object") return null;
  if (isRequestFeeFields(fee)) {
    const { display, exact } = requestFeeDisplay(fee);
    return { costDisplay: display, costExact: exact };
  }
  return fee.costDisplay ? fee : null;
}

/** Latest correlated billing receipt on a run, if any. */
export function feeFieldsFromRunEvents(
  events:
    | {
        metadata: Record<string, JsonValue>;
      }[]
    | undefined
): RequestFeeFields | undefined {
  if (!events) return undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const meta = events[i]?.metadata;
    if (!meta || meta.kind !== "billing_usage") continue;
    if (typeof meta.networkFeeUsdMicros !== "string") continue;
    return {
      networkFeeUsdMicros: meta.networkFeeUsdMicros,
      ...(typeof meta.feeWei === "string" ? { feeWei: meta.feeWei } : {}),
      ...(typeof meta.ethUsdPrice === "string"
        ? { ethUsdPrice: meta.ethUsdPrice }
        : {}),
    };
  }
  return undefined;
}

export function runToActivity(
  run: RunSummary | RunDetail,
  fee?: RequestFeeFields | RunActivityFee | null
): AccountActivityRow {
  const capability = resolveActivityCapability({
    pipeline: run.capability,
    capabilityId: run.modelId ?? run.capability,
  });
  const elapsed =
    run.startedAt && run.completedAt
      ? Date.parse(run.completedAt) - Date.parse(run.startedAt)
      : null;
  const cost =
    costFromFee(fee) ??
    costFromFee(
      feeFieldsFromRunEvents("events" in run ? run.events : undefined)
    );
  return {
    id: run.id,
    recordKind: "run",
    gatewayRequestId: run.gatewayRequestId,
    environmentId: "console",
    timestamp: run.createdAt,
    model: humanizePipelineModel(
      capability.pipeline,
      run.modelId ?? run.capability
    ),
    pipeline: capability.pipeline,
    modality: capability.modality,
    status: run.status === "succeeded" ? "success" : run.status,
    kind: "batch",
    latencyMs: elapsed,
    durationMs: null,
    signer: "paymthouse",
    signerLabel: run.source === "mcp" ? "MCP" : run.source,
    tokenId: "",
    tokenName: "",
    costDisplay: cost?.costDisplay ?? "—",
    ...(cost?.costExact ? { costExact: cost.costExact } : {}),
    providerRequestId: run.providerRequestId ?? undefined,
  };
}
