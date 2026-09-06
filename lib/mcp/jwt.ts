import * as jose from "jose";
import { pymthouseIssuerUrl, pymthouseJwksUrl } from "./env";
import { configuredPymthouseScope } from "@/lib/external-accounts/service";
import { AccessError } from "@/lib/access/service";
import { resolveMcpExternalUserId } from "./principal";

const keySets = new Map<string, ReturnType<typeof jose.createRemoteJWKSet>>();

export type McpPrincipal = {
  sub: string;
  email?: string;
  externalUserId: string;
  publicClientId: string;
  scope: string;
  token: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function scopeFromPayload(payload: jose.JWTPayload): string {
  if (typeof payload.scope === "string") return payload.scope;
  const scp = payload.scp;
  if (Array.isArray(scp)) {
    return scp.filter((s): s is string => typeof s === "string").join(" ");
  }
  return "";
}

export async function verifyMcpUserJwt(token: string): Promise<McpPrincipal> {
  let appId: string;
  try {
    appId = configuredPymthouseScope().appId;
  } catch {
    throw new AccessError("unavailable");
  }
  const issuer = pymthouseIssuerUrl();
  const jwksUrl = pymthouseJwksUrl();
  let jwks = keySets.get(jwksUrl);
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
    keySets.set(jwksUrl, jwks);
  }
  const { payload } = await jose.jwtVerify(token, jwks, {
    issuer,
    audience: issuer,
    requiredClaims: ["exp", "sub"],
  });

  const scope = scopeFromPayload(payload);
  if (!scope.split(/[\s,]+/).includes("sign:job")) {
    throw new Error("token is missing sign:job");
  }

  const sub = asString(payload.sub);
  if (!sub) {
    throw new Error("token is missing sub");
  }

  const clientId = asString(payload.client_id);
  const authorizedParty = asString(payload.azp);
  const publicClientId = clientId || authorizedParty;
  if (
    !publicClientId ||
    publicClientId !== appId ||
    (clientId && authorizedParty && clientId !== authorizedParty)
  ) {
    throw new Error("token is not bound to the configured app");
  }

  // The SDK supports sub as the legacy external-account alias. It is trusted
  // only after signature/issuer/audience/app checks and a scoped persisted lookup.
  const explicitExternal = asString(payload.external_user_id);
  const usageSubject = asString(payload.usage_subject);
  const subjectTypes = [
    asString(payload.external_user_id_type),
    asString(payload.usage_subject_type),
  ];
  if (
    subjectTypes.some((type) => type && type !== "external_user_id") ||
    (explicitExternal && usageSubject && explicitExternal !== usageSubject)
  ) {
    throw new Error("token has ambiguous external account claims");
  }
  // Normalize legacy Auth0 subjects exactly as Console does. The caller must
  // still resolve this alias through the scoped persisted account/access gate.
  const externalUserId = await resolveMcpExternalUserId(
    sub,
    explicitExternal || usageSubject
  );

  return {
    sub,
    email: asString(payload.email),
    externalUserId,
    publicClientId,
    scope,
    token,
  };
}

export function extractBearer(authorization: string | null): string | null {
  if (!authorization?.trim()) return null;
  const value = authorization.trim();
  if (value.toLowerCase().startsWith("bearer ")) {
    return value.slice(7).trim() || null;
  }
  return null;
}
