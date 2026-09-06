import {
  issueMcpRefreshToken,
  billingAppMismatch,
} from "./mcp-oauth-login-bridge";
import { requireApprovedMcpAccount } from "@/lib/mcp/access";
import { verifyMcpUserJwt } from "@/lib/mcp/jwt";

export {
  billingAppMismatch,
  STAGING_BILLING_APP_ID,
  STAGING_BILLING_ISSUER,
} from "./mcp-oauth-login-bridge";

export type McpUserTokenSet = {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
};

export class BillingAppMismatchError extends Error {
  readonly code = "billing_app_mismatch";
  constructor(description: string) {
    super(description);
    this.name = "BillingAppMismatchError";
  }
}

export async function mintMcpUserTokens(input: {
  externalUserId: string;
  email?: string;
}): Promise<McpUserTokenSet> {
  const mismatch = billingAppMismatch();
  if (mismatch) {
    throw new BillingAppMismatchError(mismatch.error_description);
  }
  await requireApprovedMcpAccount(input.externalUserId);
  const { mintEndUserAccessToken } = await import("./pymthouse-bff");
  const minted = await mintEndUserAccessToken(
    input.externalUserId,
    input.email
  );
  return {
    access_token: minted.access_token,
    refresh_token: issueMcpRefreshToken(input.externalUserId),
    token_type: "Bearer",
    expires_in: minted.expires_in,
    scope: minted.scope,
  };
}

export async function exchangeMcpSignerSession(input: {
  accessToken: string;
}): Promise<{
  access_token: string;
  expires_in: number;
  signer_url?: string;
  discovery_url?: string;
}> {
  const mismatch = billingAppMismatch();
  if (mismatch) throw new BillingAppMismatchError(mismatch.error_description);
  const principal = await verifyMcpUserJwt(input.accessToken);
  await requireApprovedMcpAccount(principal.externalUserId);
  const {
    pymthouseAppsOrigin,
    readM2mAuthHeader,
    readPublicClientId,
    readPymthouseResponse,
  } = await import("./pymthouse-http");
  const publicClientId = readPublicClientId();
  const url = `${pymthouseAppsOrigin()}/api/v1/apps/${encodeURIComponent(publicClientId)}/oidc/token`;
  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: input.accessToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
  });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: readM2mAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    cache: "no-store",
  });
  const body = await readPymthouseResponse<{
    access_token: string;
    expires_in?: number;
    signer_url?: string;
    discovery_url?: string;
  }>(response, { errorCode: "signer_exchange_failed" });
  return {
    access_token: body.access_token,
    expires_in: body.expires_in ?? 300,
    signer_url: body.signer_url,
    discovery_url: body.discovery_url,
  };
}
