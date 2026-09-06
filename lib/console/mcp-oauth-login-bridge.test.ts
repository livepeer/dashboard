import assert from "node:assert/strict";
import { test } from "node:test";

import {
  billingAppMismatch,
  issueMcpRefreshToken,
  redeemMcpRefreshToken,
  STAGING_BILLING_APP_ID,
  STAGING_BILLING_ISSUER,
} from "./mcp-oauth-login-bridge";

test("refresh token round-trips eu", () => {
  process.env.MCP_OAUTH_BRIDGE_SECRET = "test-bridge-secret";
  const token = issueMcpRefreshToken("eu_abc");
  assert.equal(redeemMcpRefreshToken(token), "eu_abc");
  assert.equal(redeemMcpRefreshToken(`${token}x`), null);
});

test("billingAppMismatch requires the staging issuer AND app in non-prod", () => {
  const prev = process.env.VERCEL_ENV;
  const prevApp = process.env.PYMTHOUSE_PUBLIC_CLIENT_ID;
  const prevIssuer = process.env.PYMTHOUSE_ISSUER_URL;
  process.env.VERCEL_ENV = "preview";
  process.env.PYMTHOUSE_ISSUER_URL = STAGING_BILLING_ISSUER;
  process.env.PYMTHOUSE_PUBLIC_CLIENT_ID = "app_deadbeefdeadbeefdeadbeef";
  assert.equal(billingAppMismatch()?.error, "billing_app_mismatch");
  process.env.PYMTHOUSE_PUBLIC_CLIENT_ID = STAGING_BILLING_APP_ID;
  assert.equal(billingAppMismatch(), null);
  process.env.PYMTHOUSE_ISSUER_URL = "https://pymthouse.com/api/v1/oidc";
  assert.equal(billingAppMismatch()?.error, "billing_app_mismatch");
  process.env.PYMTHOUSE_PUBLIC_CLIENT_ID = "app_98575870d7ae33589a3f0660";
  assert.equal(billingAppMismatch()?.error, "billing_app_mismatch");
  process.env.VERCEL_ENV = "production";
  assert.equal(billingAppMismatch(), null);
  if (prev === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = prev;
  if (prevApp === undefined) delete process.env.PYMTHOUSE_PUBLIC_CLIENT_ID;
  else process.env.PYMTHOUSE_PUBLIC_CLIENT_ID = prevApp;
  if (prevIssuer === undefined) delete process.env.PYMTHOUSE_ISSUER_URL;
  else process.env.PYMTHOUSE_ISSUER_URL = prevIssuer;
});
