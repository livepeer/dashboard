import { NextRequest, NextResponse } from "next/server";

import { pymthouseErrorResponse } from "@/app/api/pymthouse/route-helpers";
import {
  approveDevice,
  parseDeviceInitiateParams,
} from "@/lib/console/device-approval";
import { requireConsoleSession } from "@/lib/console/session-user";
import { requireSameOrigin } from "@/lib/admin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    requireSameOrigin(request);
    const session = await requireConsoleSession();
    const body = (await request.json()) as {
      iss?: unknown;
      target_link_uri?: unknown;
    };
    const params = new URLSearchParams();
    if (typeof body.iss === "string") {
      params.set("iss", body.iss);
    }
    if (typeof body.target_link_uri === "string") {
      params.set("target_link_uri", body.target_link_uri);
    }
    const parsed = parseDeviceInitiateParams(params);
    await approveDevice({
      userCode: parsed.userCode,
      clientId: parsed.clientId,
      externalUserId: session.externalUserId,
      email: session.email,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return pymthouseErrorResponse(error, "Device approval failed");
  }
}
