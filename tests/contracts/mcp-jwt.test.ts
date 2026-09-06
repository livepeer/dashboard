import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as jose from "jose";

const fixture = vi.hoisted(() => ({
  resolver: undefined as unknown,
  configured: true,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/access/service", () => ({
  AccessError: class extends Error {
    readonly status = 503;
    readonly code = "access_unavailable";
  },
}));
vi.mock("@/lib/external-accounts/service", () => ({
  configuredPymthouseScope: () => {
    if (!fixture.configured) throw new Error("missing configuration");
    return {
      service: "pymthouse",
      issuer: "https://issuer.example/oidc",
      appId: "app_fixture",
    };
  },
}));
vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return { ...actual, createRemoteJWKSet: () => fixture.resolver };
});

import { verifyMcpUserJwt } from "@/lib/mcp/jwt";
import { externalUserIdFromSub } from "@/lib/console/external-user-id";

let privateKey: CryptoKey;
let wrongKey: CryptoKey;
beforeAll(async () => {
  const pair = await jose.generateKeyPair("RS256");
  privateKey = pair.privateKey;
  wrongKey = (await jose.generateKeyPair("RS256")).privateKey;
  const jwk = await jose.exportJWK(pair.publicKey);
  fixture.resolver = jose.createLocalJWKSet({
    keys: [{ ...jwk, kid: "fixture", alg: "RS256" }],
  });
});
beforeEach(() => {
  fixture.configured = true;
  vi.stubEnv("PYMTHOUSE_ISSUER_URL", "https://issuer.example/oidc");
  vi.stubEnv("PYMTHOUSE_JWKS_URL", "https://issuer.example/oidc/jwks");
});
afterEach(() => vi.unstubAllEnvs());

function token(overrides: jose.JWTPayload = {}, key?: CryptoKey) {
  return new jose.SignJWT({
    sub: "eu_legacy",
    external_user_id: "eu_explicit",
    client_id: "app_fixture",
    scope: "sign:job",
    iss: "https://issuer.example/oidc",
    aud: "https://issuer.example/oidc",
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "fixture" })
    .sign(key ?? privateKey);
}

describe("MCP issuer-signed app-scoped identity", () => {
  it("verifies genuine signatures and preserves explicit external-account IDs", async () => {
    const result = await verifyMcpUserJwt(await token());
    expect(result).toMatchObject({
      externalUserId: "eu_explicit",
      publicClientId: "app_fixture",
    });
  });
  it("preserves signed legacy sub aliases without inventing/hash-changing an account", async () => {
    expect(
      await verifyMcpUserJwt(await token({ external_user_id: undefined }))
    ).toMatchObject({ externalUserId: "eu_legacy" });
  });
  it("supports the SDK's signed usage_subject identity alias", async () => {
    expect(
      await verifyMcpUserJwt(
        await token({
          external_user_id: undefined,
          usage_subject: "eu_usage",
          usage_subject_type: "external_user_id",
        })
      )
    ).toMatchObject({ externalUserId: "eu_usage" });
  });
  it("normalizes signed legacy Auth0 subjects to the existing Console alias", async () => {
    const sub = "google-oauth2|synthetic-account";
    expect(
      await verifyMcpUserJwt(await token({ sub, external_user_id: undefined }))
    ).toMatchObject({ externalUserId: await externalUserIdFromSub(sub) });
  });
  it("preserves an explicit account alias even when sub is a provider identity", async () => {
    expect(
      await verifyMcpUserJwt(
        await token({ sub: "auth0|synthetic", external_user_id: "eu_existing" })
      )
    ).toMatchObject({ externalUserId: "eu_existing" });
  });
  it.each([
    ["wrong issuer", { iss: "https://attacker.example" }],
    ["wrong audience", { aud: "https://attacker.example" }],
    ["wrong app", { client_id: "app_other" }],
    ["missing app", { client_id: undefined }],
    ["contradictory app", { azp: "app_other" }],
    ["expired", { exp: 1 }],
    ["missing expiry", { exp: undefined }],
    ["missing subject", { sub: undefined }],
    ["missing scope", { scope: "openid" }],
    ["conflicting external aliases", { usage_subject: "eu_other" }],
    ["unsupported subject type", { usage_subject_type: "internal" }],
    [
      "conflicting subject types",
      {
        external_user_id_type: "external_user_id",
        usage_subject_type: "internal",
      },
    ],
  ] as const)("rejects %s", async (_name, claims) => {
    await expect(verifyMcpUserJwt(await token(claims))).rejects.toBeDefined();
  });
  it("rejects a forged signature even when every claim matches", async () => {
    await expect(
      verifyMcpUserJwt(await token({}, wrongKey))
    ).rejects.toBeDefined();
  });
  it("rejects opaque tokens and unsigned claim payloads", async () => {
    await expect(verifyMcpUserJwt("opaque-value")).rejects.toBeDefined();
    const unsigned = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from('{"sub":"eu_legacy","client_id":"app_fixture"}').toString("base64url")}.`;
    await expect(verifyMcpUserJwt(unsigned)).rejects.toBeDefined();
  });
  it("reports absent configuration as unavailable, not as an authenticated account", async () => {
    fixture.configured = false;
    await expect(verifyMcpUserJwt(await token())).rejects.toMatchObject({
      status: 503,
    });
  });
});
