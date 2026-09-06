import { NextRequest, NextResponse } from "next/server";
import { PmtHouseError } from "@pymthouse/builder-sdk";
import { SessionRequiredError } from "@/lib/console/session-user";
import { AccessError } from "@/lib/access/service";

export const PYMTHOUSE_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
} as const;

export function pymthouseErrorResponse(
  error: unknown,
  fallback: string
): NextResponse {
  if (error instanceof SessionRequiredError || error instanceof AccessError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: PYMTHOUSE_NO_STORE_HEADERS }
    );
  }
  if (error instanceof PmtHouseError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: PYMTHOUSE_NO_STORE_HEADERS }
    );
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 502, headers: PYMTHOUSE_NO_STORE_HEADERS }
  );
}

/** Https-preferring public origin for Stripe Checkout return URLs. */
export function checkoutReturnOrigin(request: NextRequest): string {
  const configuredOrigin = (
    process.env.DASHBOARD_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  let origin = configuredOrigin || request.nextUrl.origin;
  try {
    const parsed = new URL(origin);
    if (
      parsed.protocol === "http:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) {
      parsed.protocol = "https:";
    }
    origin = parsed.origin;
  } catch {
    origin = request.nextUrl.origin;
  }
  return origin;
}
