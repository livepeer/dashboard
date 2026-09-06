import { NextResponse } from "next/server";
import { waitlistReturnPath } from "@/lib/waitlist/return-path";
export const runtime = "nodejs";
export function GET(request: Request) {
  return NextResponse.redirect(
    new URL(
      waitlistReturnPath(new URL(request.url).searchParams),
      request.url
    )
  );
}
