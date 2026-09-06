import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { AUTH_SIGNIN_HREF } from "@/lib/console/auth-login";
import { devMockResponse } from "@/lib/console/dev-mock";
import { identitySyncPath } from "@/lib/identity/sync-return";

function copyAuthCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}

// Routes that exist only for a signed-in user. Signed-out requests are
// redirected here, in middleware, rather than by the page: a client-side
// redirect runs after the console chrome has already painted, so a cold
// signed-out load flashed the sidebar for a frame before landing on /login.
// Home keeps the in-shell sign-in wall; Install redirects before the shell.
function isSessionOnlyPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/install";
}

export async function middleware(request: NextRequest) {
  // Dev-only: answer auth + PymtHouse endpoints from fixtures so auth-gated
  // surfaces can be designed without credentials. See lib/console/dev-mock.ts.
  const devMock =
    process.env.NODE_ENV !== "production" &&
    process.env.CONSOLE_DEV_MOCK === "1";
  if (devMock) {
    const mocked = devMockResponse(
      request.nextUrl.pathname,
      request.nextUrl.searchParams,
      request.url
    );
    if (mocked) return mocked;
  }

  const authRes = await auth0.middleware(request);
  const { pathname } = request.nextUrl;
  // Edge middleware manages provider cookies and early signed-out routing.
  // Admission is checked in Node page/API services on every protected request.
  if (!isSessionOnlyPath(pathname)) {
    return authRes;
  }

  const redirectTo = (path: string) =>
    copyAuthCookies(authRes, NextResponse.redirect(new URL(path, request.url)));

  const legacyReferralCode = request.nextUrl.searchParams.get("ref")?.trim();
  if (pathname === "/" && legacyReferralCode) {
    const waitlistUrl = new URL("/waitlist", request.url);
    waitlistUrl.searchParams.set("ref", legacyReferralCode);
    return copyAuthCookies(authRes, NextResponse.redirect(waitlistUrl));
  }

  try {
    const session = await auth0.getSession(request);
    // The dev mock has no real session cookie but is always "signed in" —
    // its /auth/profile fixture is what the client reads.
    const signedIn = devMock || !!session?.user;

    if (!signedIn) {
      return isSessionOnlyPath(pathname)
        ? redirectTo(AUTH_SIGNIN_HREF)
        : authRes;
    }
    // `/` is a pure redirect in both auth states; resolve it here too so the
    // signed-in case resolves admission and admin landing in Node, not Edge.
    if (pathname === "/") {
      return redirectTo(devMock ? "/home" : identitySyncPath("/home"));
    }
  } catch {
    return authRes;
  }

  return authRes;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
