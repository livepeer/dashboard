import { NextRequest, NextResponse } from "next/server";

import {
  requireConsoleSession,
  SessionRequiredError,
} from "@/lib/console/session-user";
import {
  issueAuthCode,
  parsePending,
  PKCE_COOKIE,
  pkceCookieOptions,
} from "@/lib/mcp/as";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const pending = parsePending(req.cookies.get(PKCE_COOKIE)?.value);
  const origin = req.nextUrl.origin;
  const clear = NextResponse.redirect(new URL("/", req.url), 302);
  clear.cookies.set(PKCE_COOKIE, "", { ...pkceCookieOptions(), maxAge: 0 });

  if (!pending) {
    return clear;
  }

  let session;
  try {
    session = await requireConsoleSession();
  } catch (error) {
    if (error instanceof SessionRequiredError) {
      const login = new URL("/auth/login", origin);
      login.searchParams.set("returnTo", "/api/mcp/oauth/callback");
      return NextResponse.redirect(login);
    }
    // This endpoint is a browser handoff, not a token API. Explain admission
    // failure on the waiting page, and terminate rather than issue a code.
    const response = NextResponse.redirect(
      new URL("/access-pending?from=mcp", origin),
      302
    );
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(PKCE_COOKIE, "", {
      ...pkceCookieOptions(),
      maxAge: 0,
    });
    return response;
  }
  let code: string;
  try {
    code = issueAuthCode({
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      clientId: pending.clientId,
      externalUserId: session.externalUserId,
      email: session.email,
    });
  } catch {
    return clear;
  }

  const target = new URL(pending.redirectUri);
  target.searchParams.set("code", code);
  target.searchParams.set("state", pending.clientState);
  target.searchParams.set("iss", pending.issuer);
  const response = NextResponse.redirect(target.toString(), 302);
  response.cookies.set(PKCE_COOKIE, "", { ...pkceCookieOptions(), maxAge: 0 });
  return response;
}
