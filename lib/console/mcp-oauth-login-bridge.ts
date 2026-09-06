import { createHmac, timingSafeEqual } from "node:crypto";

function bridgeSecret(): string {
  return (
    process.env.MCP_OAUTH_BRIDGE_SECRET?.trim() ||
    process.env.MCP_AS_SECRET?.trim() ||
    process.env.AUTH0_SECRET?.trim() ||
    ""
  );
}

function signPayload(payload: string): string {
  const secret = bridgeSecret();
  if (!secret) {
    throw new Error("MCP OAuth bridge secret is not configured");
  }
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifySignedPayload(value: string): string | null {
  const secret = bridgeSecret();
  if (!secret) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  return payload;
}

export const MCP_REFRESH_PREFIX = "mcp_rt_";
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function issueMcpRefreshToken(externalUserId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      eu: externalUserId,
      exp: Date.now() + REFRESH_TTL_MS,
    }),
    "utf8"
  ).toString("base64url");
  return `${MCP_REFRESH_PREFIX}${signPayload(payload)}`;
}

export function redeemMcpRefreshToken(
  token: string | undefined
): string | null {
  const trimmed = token?.trim() ?? "";
  if (!trimmed.startsWith(MCP_REFRESH_PREFIX)) return null;
  const signed = trimmed.slice(MCP_REFRESH_PREFIX.length);
  const payload = verifySignedPayload(signed);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { eu?: unknown; exp?: unknown };
    if (
      typeof parsed.eu !== "string" ||
      !parsed.eu ||
      parsed.eu.length > 256 ||
      typeof parsed.exp !== "number" ||
      parsed.exp < Date.now()
    ) {
      return null;
    }
    return parsed.eu;
  } catch {
    return null;
  }
}

export const STAGING_BILLING_APP_ID = "app_088f2082a8f1161d60179431";
export const STAGING_BILLING_ISSUER =
  "https://staging.pymthouse.com/api/v1/oidc";

export function billingAppMismatch(): {
  error: string;
  error_description: string;
} | null {
  if (process.env.VERCEL_ENV === "production") {
    return null;
  }
  const publicClientId = process.env.PYMTHOUSE_PUBLIC_CLIENT_ID?.trim() ?? "";
  const issuer = process.env.PYMTHOUSE_ISSUER_URL?.trim().replace(/\/+$/, "");
  if (
    publicClientId === STAGING_BILLING_APP_ID &&
    issuer === STAGING_BILLING_ISSUER
  ) {
    return null;
  }
  return {
    error: "billing_app_mismatch",
    error_description:
      "Non-production mint requires the isolated staging PymtHouse issuer and app",
  };
}
