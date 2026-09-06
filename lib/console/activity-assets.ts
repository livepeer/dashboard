import "server-only";

import type { SignedTicketRequestRow } from "@/lib/console/account-usage";
import { listAssetsForGatewayRequestIds } from "@/lib/mcp/store";

/**
 * Exact owner + gateway correlation only. Never infer a run's output from
 * nearby timestamps or a similarly named model. Hidden library assets remain
 * part of history; unavailable media does not remove its reference.
 */
export async function attachOutputsToTickets(
  principalId: string,
  items: SignedTicketRequestRow[]
): Promise<SignedTicketRequestRow[]> {
  const assets = await listAssetsForGatewayRequestIds(
    principalId,
    items.map((item) => item.gatewayRequestId).filter(Boolean)
  );
  const byGateway = new Map<string, (typeof assets)[number]>();
  for (const asset of assets)
    if (!byGateway.has(asset.gatewayRequestId))
      byGateway.set(asset.gatewayRequestId, asset);
  return items.map((item) => {
    const asset = byGateway.get(item.gatewayRequestId);
    return asset
      ? {
          ...item,
          outputUrl: asset.url,
          providerRequestId: asset.providerRequestId,
        }
      : item;
  });
}
