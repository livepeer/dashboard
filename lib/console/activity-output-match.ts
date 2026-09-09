import type { SignedTicketRequestRow } from "@/lib/console/account-usage";

export type JobOutput = {
  url: string;
  providerRequestId?: string | null;
};

export type MatchableAsset = {
  id: string;
  url: string;
  capability: string;
  createdAt: string;
  gatewayRequestId: string;
  providerRequestId?: string | null;
};

/** Orchestrator Kafka events use RandomManifestID as CloudEvent id (~8 hex). */
export const TICKET_ASSET_MATCH_WINDOW_MS = 15 * 60 * 1000;

const ORCHESTRATOR_HEX_ID = /^[0-9a-f]{8}$/i;

export function isOrchestratorTicketId(id: string): boolean {
  return ORCHESTRATOR_HEX_ID.test(id.trim());
}

function ticketKeys(ticket: SignedTicketRequestRow): string[] {
  return [ticket.gatewayRequestId, ticket.eventId]
    .map((id) => id.trim())
    .filter((id, index, all) => id.length > 0 && all.indexOf(id) === index);
}

function outputFromAsset(asset: MatchableAsset): JobOutput {
  return {
    url: asset.url,
    providerRequestId: asset.providerRequestId,
  };
}

function needsFuzzyMatch(ticket: SignedTicketRequestRow): boolean {
  return ticketKeys(ticket).every(isOrchestratorTicketId);
}

/**
 * Map each OpenMeter ticket to a stored media URL.
 * Exact `gateway_request_id` / event id wins. Orchestrator 8-hex tickets
 * that never received an MCP `job_*` id may join the nearest same-capability
 * asset in the window — skipped when more than one candidate exists (race).
 */
export function matchTicketOutputs(
  tickets: SignedTicketRequestRow[],
  assets: MatchableAsset[]
): Map<string, JobOutput> {
  const byId = new Map<string, MatchableAsset>();
  for (const asset of assets) {
    const key = asset.gatewayRequestId.trim();
    if (key && !byId.has(key)) byId.set(key, asset);
  }

  const used = new Set<string>();
  const out = new Map<string, JobOutput>();

  for (const ticket of tickets) {
    const keys = ticketKeys(ticket);
    const exact = keys.map((key) => byId.get(key)).find(Boolean);
    if (exact) {
      used.add(exact.id);
      out.set(ticket.gatewayRequestId, outputFromAsset(exact));
    }
  }

  for (const ticket of tickets) {
    if (out.has(ticket.gatewayRequestId)) continue;
    if (!needsFuzzyMatch(ticket)) continue;
    const ticketTime = Date.parse(ticket.time);
    if (!Number.isFinite(ticketTime) || !ticket.modelId.trim()) continue;
    const candidates: Array<{ asset: MatchableAsset; delta: number }> = [];
    for (const asset of assets) {
      if (used.has(asset.id)) continue;
      if (asset.capability !== ticket.modelId) continue;
      const created = Date.parse(asset.createdAt);
      if (!Number.isFinite(created)) continue;
      const delta = Math.abs(created - ticketTime);
      if (delta > TICKET_ASSET_MATCH_WINDOW_MS) continue;
      candidates.push({ asset, delta });
    }
    if (candidates.length !== 1) continue;
    const hit = candidates[0]!;
    used.add(hit.asset.id);
    out.set(ticket.gatewayRequestId, outputFromAsset(hit.asset));
  }

  return out;
}

export type FeeTicket = {
  gatewayRequestId: string;
  modelId: string;
  time: string;
  costDisplay: string;
  costExact?: string;
};

export type FeeRun = {
  gatewayRequestId: string;
  capability: string;
  createdAt: string;
};

/**
 * Join PymtHouse tickets onto console runs.
 * Production tickets are orchestrator 8-hex CloudEvent ids; MCP runs store
 * `job_*`. Exact id wins; leftover 8-hex tickets assign greedily to the
 * nearest unused same-capability run in the asset-match window.
 */
export function matchRunTicketFees(
  runs: FeeRun[],
  tickets: FeeTicket[]
): Map<string, { costDisplay: string; costExact?: string }> {
  const out = new Map<string, { costDisplay: string; costExact?: string }>();
  const used = new Set<string>();
  const feeOf = (ticket: FeeTicket) => ({
    costDisplay: ticket.costDisplay,
    ...(ticket.costExact ? { costExact: ticket.costExact } : {}),
  });

  for (const run of runs) {
    const exact = tickets.find(
      (ticket) =>
        ticket.gatewayRequestId === run.gatewayRequestId &&
        !used.has(ticket.gatewayRequestId)
    );
    if (!exact || exact.costDisplay === "—") continue;
    used.add(exact.gatewayRequestId);
    out.set(run.gatewayRequestId, feeOf(exact));
  }

  const remaining = [...runs]
    .filter((run) => !out.has(run.gatewayRequestId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const run of remaining) {
    const runTime = Date.parse(run.createdAt);
    if (!Number.isFinite(runTime) || !run.capability.trim()) continue;
    let best: { ticket: FeeTicket; delta: number } | null = null;
    for (const ticket of tickets) {
      if (used.has(ticket.gatewayRequestId)) continue;
      if (!isOrchestratorTicketId(ticket.gatewayRequestId)) continue;
      if (ticket.modelId !== run.capability) continue;
      if (ticket.costDisplay === "—") continue;
      const ticketTime = Date.parse(ticket.time);
      if (!Number.isFinite(ticketTime)) continue;
      const delta = Math.abs(ticketTime - runTime);
      if (delta > TICKET_ASSET_MATCH_WINDOW_MS) continue;
      if (!best || delta < best.delta) best = { ticket, delta };
    }
    if (!best) continue;
    used.add(best.ticket.gatewayRequestId);
    out.set(run.gatewayRequestId, feeOf(best.ticket));
  }

  return out;
}
