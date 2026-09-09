import { NextRequest, NextResponse } from "next/server";
import { attachOutputsToTickets } from "@/lib/console/activity-assets";
import { takeGatewayRequestIds } from "@/lib/console/gateway-request-ids";
import { fetchAccountRequestsForExternalUser } from "@/lib/console/pymthouse-bff";
import { requireConsoleSession } from "@/lib/console/session-user";
import { AccessError } from "@/lib/access/service";
import { configuredPymthouseScope } from "@/lib/external-accounts/service";
import {
  existingRunGatewayIds,
  recordRunUsage,
  resolveRunOwner,
} from "@/lib/runs/store";
import type { SignedTicketRequestRow } from "@/lib/console/account-usage";
import type { JsonValue } from "@/lib/runs/types";
import {
  PYMTHOUSE_NO_STORE_HEADERS,
  pymthouseErrorResponse,
} from "@/app/api/pymthouse/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_LEGACY_LOOKUP_PAGES = 5;
const MAX_CORRELATED_LOOKUP_PAGES = 40;

function persistableTicketFees(items: SignedTicketRequestRow[]) {
  return items
    .map((item) => {
      const metadata: Record<string, JsonValue> = {};
      for (const key of [
        "networkFeeUsdMicros",
        "feeWei",
        "ethUsdPrice",
        "pixels",
      ] as const) {
        const value = item[key];
        if (
          typeof value === "string" &&
          value.length <= 128 &&
          /^\d+(?:\.\d+)?$/.test(value)
        )
          metadata[key] = value;
      }
      return {
        eventId: item.eventId,
        gatewayRequestId: item.gatewayRequestId,
        metadata,
      };
    })
    .filter(
      (ticket) =>
        typeof ticket.eventId === "string" &&
        ticket.eventId.length > 0 &&
        ticket.eventId.length <= 512 &&
        typeof ticket.gatewayRequestId === "string" &&
        ticket.gatewayRequestId.length > 0 &&
        ticket.gatewayRequestId.length <= 512
    );
}

export async function GET(request: NextRequest) {
  // Home joins receipts onto durable runs; legacy consumers still omit matches.
  const includeCorrelated =
    request.nextUrl.searchParams.get("includeCorrelated") === "1";
  const gatewayRequestIds = takeGatewayRequestIds(
    request.nextUrl.searchParams.getAll("gatewayRequestId")
  );
  if (gatewayRequestIds.length > 0 && !includeCorrelated) {
    return NextResponse.json(
      { error: "gatewayRequestId requires includeCorrelated=1" },
      { status: 400, headers: PYMTHOUSE_NO_STORE_HEADERS }
    );
  }
  if (gatewayRequestIds.some((id) => id.length > 512)) {
    return NextResponse.json(
      { error: "gatewayRequestId too long" },
      { status: 400, headers: PYMTHOUSE_NO_STORE_HEADERS }
    );
  }
  const cursor =
    request.nextUrl.searchParams.get("cursor")?.trim() || undefined;
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
  if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
    return NextResponse.json(
      { error: "limit must be between 1 and 50" },
      { status: 400, headers: PYMTHOUSE_NO_STORE_HEADERS }
    );
  }

  try {
    const session = await requireConsoleSession();
    const appId = configuredPymthouseScope().appId;
    if (gatewayRequestIds.length > 0) {
      // Production tickets are orchestrator 8-hex CloudEvent ids; MCP runs
      // store `job_*`. The by-id query param is ignored, so never filter the
      // feed down to those job ids — Home joins on capability + time.
      const collected: SignedTicketRequestRow[] = [];
      const seen = new Set<string>();
      let next: string | undefined;
      let lastPayload: Awaited<
        ReturnType<typeof fetchAccountRequestsForExternalUser>
      > | null = null;
      for (let page = 0; page < MAX_CORRELATED_LOOKUP_PAGES; page++) {
        const nextPayload = await fetchAccountRequestsForExternalUser({
          externalUserId: session.externalUserId,
          email: session.email,
          cursor: next,
          limit,
          recentWindow: true,
        });
        if (
          nextPayload.externalUserId !== session.externalUserId ||
          nextPayload.clientId !== appId
        )
          throw new AccessError("unavailable");
        lastPayload = nextPayload;
        for (const item of nextPayload.items) {
          if (
            (item.externalUserId &&
              item.externalUserId !== session.externalUserId) ||
            (item.clientId && item.clientId !== appId)
          )
            continue;
          const key = `${item.eventId}\0${item.gatewayRequestId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          collected.push(item);
        }
        if (!nextPayload.nextCursor || nextPayload.nextCursor === next) break;
        next = nextPayload.nextCursor;
      }
      if (collected.length === 0) {
        console.warn("[account-requests] live Cost lookup returned no tickets", {
          requestedGatewayRequestIds: gatewayRequestIds.slice(0, 10),
        });
      }
      return NextResponse.json(
        {
          items: collected,
          nextCursor: null,
          openMeterConfigured: lastPayload?.openMeterConfigured !== false,
          clientId: lastPayload?.clientId ?? appId,
          externalUserId: lastPayload?.externalUserId ?? session.externalUserId,
        },
        { headers: PYMTHOUSE_NO_STORE_HEADERS }
      );
    }
    if (includeCorrelated) {
      const payload = await fetchAccountRequestsForExternalUser({
        externalUserId: session.externalUserId,
        email: session.email,
        cursor,
        limit,
      });
      if (
        payload.externalUserId !== session.externalUserId ||
        payload.clientId !== appId
      )
        throw new AccessError("unavailable");
      const scoped = payload.items.filter(
        (item) =>
          item.externalUserId === session.externalUserId &&
          item.clientId === appId
      );
      return NextResponse.json(
        { ...payload, items: scoped },
        { headers: PYMTHOUSE_NO_STORE_HEADERS }
      );
    }
    let owner;
    try {
      owner = await resolveRunOwner(session.externalUserId);
      if (owner.userId !== session.canonicalUserId)
        throw new Error("run_owner_mismatch");
    } catch {
      throw new AccessError("unavailable");
    }
    let next = cursor;
    // Upstream cursors are independent from durable-run cursors. Skip at most
    // five entirely correlated pages per request, preserving actual continuation.
    for (let page = 0; page < MAX_LEGACY_LOOKUP_PAGES; page++) {
      const payload = await fetchAccountRequestsForExternalUser({
        externalUserId: session.externalUserId,
        email: session.email,
        cursor: next,
        limit,
      });
      if (
        payload.externalUserId !== session.externalUserId ||
        payload.clientId !== appId
      )
        throw new AccessError("unavailable");
      const scoped = payload.items.filter(
        (item) =>
          item.externalUserId === session.externalUserId &&
          item.clientId === appId
      );
      await recordRunUsage(owner, persistableTicketFees(scoped));
      const correlated = new Set(
        await existingRunGatewayIds(
          owner,
          scoped.map((item) => item.gatewayRequestId)
        )
      );
      const legacy = scoped.filter(
        (item) => !correlated.has(item.gatewayRequestId)
      );
      if (
        legacy.length ||
        !payload.nextCursor ||
        page === MAX_LEGACY_LOOKUP_PAGES - 1 ||
        payload.nextCursor === next
      ) {
        const items = await attachOutputsToTickets(
          session.externalUserId,
          legacy
        );
        return NextResponse.json(
          { ...payload, items },
          { headers: PYMTHOUSE_NO_STORE_HEADERS }
        );
      }
      next = payload.nextCursor;
    }
    throw new Error("Requests pagination unavailable");
  } catch (error) {
    return pymthouseErrorResponse(error, "Requests fetch failed");
  }
}
