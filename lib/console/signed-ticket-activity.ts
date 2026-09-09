import type { AccountActivityRow, PipelineKind } from "@/lib/console/types";
import type { SignedTicketRequestRow } from "@/lib/console/account-usage";
import { resolveActivityCapability } from "@/lib/console/capability-modality";
import { requestFeeDisplay } from "@/lib/console/request-fee-display";
import { humanizePipelineModel } from "@/lib/console/usage-capability-display";

const LIVE_PIPELINES = new Set([
  "video-to-video",
  "live-video-to-video",
  "live-transcoding",
]);

function inferKind(pipeline: string, modality: string): PipelineKind {
  return LIVE_PIPELINES.has(pipeline) || modality === "realtime"
    ? "live"
    : "batch";
}

/** Map PymtHouse signed-ticket rows into the /calls table shape. */
export function mapSignedTicketToActivityRow(
  row: SignedTicketRequestRow
): AccountActivityRow {
  const { modality, pipeline } = resolveActivityCapability({
    pipeline: row.pipeline,
    capabilityId: row.modelId,
  });
  const kind = inferKind(pipeline, modality);
  const model = humanizePipelineModel(pipeline, row.modelId);
  const { display, exact } = requestFeeDisplay(row);

  return {
    id: `usage:${row.eventId}`,
    gatewayRequestId: row.gatewayRequestId,
    capabilityId: row.modelId,
    recordKind: "usage",
    environmentId: "env-production",
    timestamp: row.time,
    model,
    pipeline,
    modality,
    status: "unknown",
    kind,
    latencyMs: null,
    durationMs: null,
    signer: "paymthouse",
    signerLabel: row.appName?.trim() || "PymtHouse",
    tokenId: "",
    tokenName: "",
    costDisplay: display,
    costExact: exact,
    outputUrl: row.outputUrl?.trim() || undefined,
    providerRequestId: row.providerRequestId?.trim() || undefined,
  };
}
