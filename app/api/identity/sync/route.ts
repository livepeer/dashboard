import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedIdentity } from "@/lib/authentication/session";
import { resolveProviderIdentity } from "@/lib/identity/provider-user";
import { enrollAuthenticatedUser } from "@/lib/access/enrollment";
import {
  safeIdentityReturnTo,
  isProtocolReturnPath,
} from "@/lib/identity/sync-return";
import { getAccessDecision } from "@/lib/access/service";
import { getAdminPrincipalForUser } from "@/lib/admin/permissions";
import { waitlistReturnPath } from "@/lib/waitlist/return-path";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  // In-flight transactions from the retired Auth0 waitlist CTA return to the
  // email form. Auth0 remains Console's authentication authority.
  if (request.nextUrl.searchParams.get("from") === "waitlist")
    return NextResponse.redirect(
      new URL(waitlistReturnPath(request.nextUrl.searchParams), request.url)
    );
  const returnTo = safeIdentityReturnTo(
    request.nextUrl.searchParams.get("returnTo")
  );
  const identity = await getAuthenticatedIdentity();
  if (!identity) {
    const login = new URL("/login", request.url);
    login.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(login);
  }
  let destination = "/access-pending";
  try {
    const canonical = await resolveProviderIdentity(identity);
    await enrollAuthenticatedUser(identity, canonical);
    const decision = await getAccessDecision(canonical.userId);
    if (decision.state === "approved")
      destination = (await getAdminPrincipalForUser(canonical.userId))
        ? "/admin"
        : "/home";
    if (returnTo === "/waitlist") destination = "/waitlist";
  } catch (error) {
    console.error("identity_sync_failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
  }
  return NextResponse.redirect(
    new URL(
      isProtocolReturnPath(returnTo) ? returnTo : destination,
      request.url
    )
  );
}
