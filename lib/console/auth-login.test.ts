import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AUTH_SIGNIN_HREF,
  AUTH_SIGNUP_HREF,
  authLoginHref,
  consoleSignInHref,
  consoleSignUpHref,
  isConsoleAuthPath,
  safeReturnTo,
} from "./auth-login";

test("safeReturnTo allows same-origin relative paths", () => {
  assert.equal(safeReturnTo("/waitlist"), "/waitlist");
  assert.equal(safeReturnTo("/device?user_code=abc"), "/device?user_code=abc");
  assert.equal(safeReturnTo("  /home  "), "/home");
});

test("safeReturnTo rejects absolute and protocol-relative URLs", () => {
  assert.equal(safeReturnTo("https://evil.example/phish"), "/home");
  assert.equal(safeReturnTo("//evil.example"), "/home");
  assert.equal(safeReturnTo("/\\evil.example"), "/home");
  assert.equal(safeReturnTo("https://evil.example"), "/home");
  assert.equal(safeReturnTo(""), "/home");
  assert.equal(safeReturnTo(undefined), "/home");
  assert.equal(safeReturnTo("/ok", "/keys"), "/ok");
  assert.equal(safeReturnTo("//x", "/keys"), "/keys");
});

test("authLoginHref is the Auth0 SDK handoff", () => {
  assert.equal(
    authLoginHref(),
    "/auth/login?returnTo=%2Fapi%2Fidentity%2Fsync%3FreturnTo%3D%252Fhome"
  );
  assert.equal(
    authLoginHref({ signup: true }),
    "/auth/login?screen_hint=signup&returnTo=%2Fapi%2Fidentity%2Fsync%3FreturnTo%3D%252Fhome"
  );
  assert.equal(
    authLoginHref({ returnTo: "/waitlist", loginHint: "a@b.com" }),
    "/auth/login?returnTo=%2Fapi%2Fidentity%2Fsync%3FreturnTo%3D%252Fwaitlist&login_hint=a%40b.com"
  );
  assert.equal(
    authLoginHref({ connection: "google-oauth2", returnTo: "//evil.example" }),
    "/auth/login?returnTo=%2Fapi%2Fidentity%2Fsync%3FreturnTo%3D%252Fhome&connection=google-oauth2"
  );
  assert.equal(
    authLoginHref({ connection: "github", signup: true }),
    "/auth/login?screen_hint=signup&returnTo=%2Fapi%2Fidentity%2Fsync%3FreturnTo%3D%252Fhome&connection=github"
  );
});

test("console sign-in/up hrefs stay on the branded pages", () => {
  assert.equal(AUTH_SIGNIN_HREF, "/login");
  assert.equal(AUTH_SIGNUP_HREF, "/signup");
  assert.equal(consoleSignInHref({ returnTo: "/waitlist" }), "/login?returnTo=%2Fwaitlist");
  assert.equal(consoleSignUpHref({ returnTo: "/waitlist" }), "/signup?returnTo=%2Fwaitlist");
  assert.equal(consoleSignInHref({ returnTo: "https://evil.example" }), "/login");
});

test("isConsoleAuthPath covers branded pages and the SDK mount", () => {
  assert.equal(isConsoleAuthPath("/login"), true);
  assert.equal(isConsoleAuthPath("/signup"), true);
  assert.equal(isConsoleAuthPath("/auth/login"), true);
  assert.equal(isConsoleAuthPath("/home"), false);
  assert.equal(isConsoleAuthPath("/explore"), false);
});
