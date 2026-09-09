import { NextRequest, NextResponse } from "next/server";
import { attachOutputsToTickets } from "@/lib/console/activity-assets";
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
  const gatewayRequestIds = [
    ...new Set(
      request.nextUrl.searchParams
        .getAll("gatewayRequestId")
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];
  if (gatewayRequestIds.length > 50) {
    return NextResponse.json(
      { error: "at most 50 gatewayRequestId values" },
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
    let owner;
    try {
      owner = await resolveRunOwner(session.externalUserId);
      if (owner.userId !== session.canonicalUserId)
        throw new Error("run_owner_mismatch");
    } catch {
      throw new AccessError("unavailable");
    }
    const appId = configuredPymthouseScope().appId;
    if (gatewayRequestIds.length > 0) {
      const payload = await fetchAccountRequestsForExternalUser({
        externalUserId: session.externalUserId,
        email: session.email,
        limit,
        gatewayRequestIds,
      });
      if (
        payload.externalUserId !== session.externalUserId ||
        payload.clientId !== appId
      )
        throw new AccessError("unavailable");
      const wanted = new Set(gatewayRequestIds);
      const scoped = payload.items.filter(
        (item) =>
          item.externalUserId === session.externalUserId &&
          item.clientId === appId &&
          wanted.has(item.gatewayRequestId)
      );
      await recordRunUsage(owner, persistableTicketFees(scoped));
      return NextResponse.json(
        { ...payload, items: scoped, nextCursor: null },
        { headers: PYMTHOUSE_NO_STORE_HEADERS }
      );
    }
    let next = cursor;
    // Upstream cursors are independent from durable-run cursors. Skip at most
    // five entirely correlated pages per request, preserving actual continuation.
    for (let page = 0; page < 5; page++) {
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
      if (includeCorrelated) {
        return NextResponse.json(
          { ...payload, items: scoped },
          { headers: PYMTHOUSE_NO_STORE_HEADERS }
        );
      }
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
        page === 4 ||
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
