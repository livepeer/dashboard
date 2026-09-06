import { PmtHouseError } from "@pymthouse/builder-sdk";
import {
  normalizeDeviceExchangeResponse,
  parseApiKeyExchangeRequestBody,
} from "@pymthouse/builder-sdk/signer/server";
import {
  pymthouseAppsOrigin,
  readPymthouseM2mConfig,
  readPublicClientId,
} from "@/lib/console/pymthouse-http";
import { verifyMcpUserJwt } from "@/lib/mcp/jwt";
import { requireApprovedMcpAccount } from "@/lib/mcp/access";
import { AccessError } from "@/lib/access/service";
import { billingAppMismatch } from "@/lib/console/mcp-oauth-login-bridge";

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

type ExchangeConfig = {
  issuerUrl: string;
  publicClientId: string;
  m2mClientId: string;
  m2mClientSecret: string;
};

/** Thin BFF; canonical issuer route is POST …/apps/{clientId}/oidc/token (RFC 8693). */
function readApiKeyExchangeConfig(): ExchangeConfig | null {
  const m2m = readPymthouseM2mConfig();
  try {
    const publicClientId = readPublicClientId();
    const issuerUrl =
      m2m?.issuerUrl ?? process.env.PYMTHOUSE_ISSUER_URL?.trim();
    if (!issuerUrl) return null;
    return {
      issuerUrl,
      publicClientId,
      m2mClientId: m2m?.m2mClientId ?? "",
      m2mClientSecret: m2m?.m2mClientSecret ?? "",
    };
  } catch {
    return null;
  }
}

function readStringField(
  body: Record<string, unknown>,
  key: string
): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function exchangeApiKeyViaOidcToken(input: {
  config: ExchangeConfig;
  apiKey: string;
  scope?: string;
}): Promise<Response> {
  const { config, apiKey, scope } = input;
  const url = `${pymthouseAppsOrigin(config.issuerUrl)}/api/v1/apps/${encodeURIComponent(config.publicClientId)}/oidc/token`;

  const form = new URLSearchParams({
    grant_type: TOKEN_EXCHANGE_GRANT,
    subject_token: apiKey,
    subject_token_type: ACCESS_TOKEN_TYPE,
  });
  if (scope) {
    form.set("scope", scope);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (config.m2mClientId && config.m2mClientSecret) {
    const basic = Buffer.from(
      [config.m2mClientId, config.m2mClientSecret].join(":")
    ).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: form.toString(),
    cache: "no-store",
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new PmtHouseError("Token exchange returned invalid JSON", {
      status: 502,
      code: "invalid_exchange_response",
    });
  }

  if (!response.ok) {
    const description =
      readStringField(parsed, "error_description") ||
      readStringField(parsed, "error") ||
      `Token exchange failed (${response.status})`;
    throw new PmtHouseError(description, {
      status: response.status,
      code: readStringField(parsed, "error") ?? "api_key_exchange_failed",
    });
  }

  const accessToken = readStringField(parsed, "access_token");
  if (!accessToken) {
    throw new PmtHouseError("Token exchange response missing access_token", {
      status: 502,
      code: "invalid_exchange_response",
    });
  }

  // The issuer is the only authority for opaque API-key ownership. Never expose
  // its exchanged credentials before verifying their signed app-bound owner.
  let principal;
  try {
    principal = await verifyMcpUserJwt(accessToken);
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new PmtHouseError(
      "Token exchange did not establish a verified account",
      {
        status: 401,
        code: "invalid_exchange_identity",
      }
    );
  }
  await requireApprovedMcpAccount(principal.externalUserId);

  // signer_url comes from the issuer exchange response (app signer routing).
  const signerUrl = readStringField(parsed, "signer_url");

  const expiresIn =
    typeof parsed.expires_in === "number" && Number.isFinite(parsed.expires_in)
      ? parsed.expires_in
      : 3600;

  const body = normalizeDeviceExchangeResponse(
    {
      access_token: accessToken,
      expires_in: expiresIn,
      scope: readStringField(parsed, "scope") || scope || "sign:job",
      balanceUsdMicros: readStringField(parsed, "balanceUsdMicros") ?? "0",
      lifetimeGrantedUsdMicros:
        readStringField(parsed, "lifetimeGrantedUsdMicros") ?? "0",
    },
    { signer_url: signerUrl }
  );

  return Response.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof AccessError) {
    return Response.json(
      { error: error.code, error_description: error.message },
      {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
  if (error instanceof PmtHouseError) {
    return Response.json(
      {
        error: error.code ?? "api_key_exchange_failed",
        error_description: error.message,
      },
      { status: error.status ?? 500 }
    );
  }
  const message =
    error instanceof Error ? error.message : "API key exchange failed";
  return Response.json(
    { error: "api_key_exchange_failed", error_description: message },
    { status: 500 }
  );
}

export async function POST(request: Request) {
  const mismatch = billingAppMismatch();
  if (mismatch) {
    return Response.json(mismatch, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const config = readApiKeyExchangeConfig();
  if (!config) {
    return Response.json(
      {
        error: "server_misconfigured",
        error_description:
          "PYMTHOUSE_ISSUER_URL and PYMTHOUSE_PUBLIC_CLIENT_ID are required",
      },
      { status: 503 }
    );
  }

  try {
    const parsed = await parseApiKeyExchangeRequestBody(request);
    const effectiveClientId = parsed.clientId?.trim() || config.publicClientId;
    if (effectiveClientId !== config.publicClientId) {
      throw new PmtHouseError(
        "clientId does not match configured public client",
        {
          status: 400,
          code: "invalid_request",
        }
      );
    }
    return await exchangeApiKeyViaOidcToken({
      config,
      apiKey: parsed.apiKey,
      scope: parsed.scope,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
