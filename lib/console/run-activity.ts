import type { RunSummary } from "@/lib/runs/types";
import type { AccountActivityRow } from "./types";
import { resolveActivityCapability } from "./capability-modality";
import { humanizePipelineModel } from "./usage-capability-display";

export function runToActivity(run: RunSummary): AccountActivityRow {
  const capability = resolveActivityCapability({
    pipeline: run.capability,
    capabilityId: run.modelId ?? run.capability,
  });
  const elapsed =
    run.startedAt && run.completedAt
      ? Date.parse(run.completedAt) - Date.parse(run.startedAt)
      : null;
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
    costDisplay: "—",
    providerRequestId: run.providerRequestId ?? undefined,
  };
}
