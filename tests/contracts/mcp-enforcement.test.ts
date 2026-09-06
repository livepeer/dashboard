import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  class AccessError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(
      readonly state: string,
      code = `access_${state}`
    ) {
      super(`Access ${state}`);
      this.code = code;
      this.status = state === "unavailable" ? 503 : 403;
    }
  }
  class SessionRequiredError extends Error {
    readonly status = 401;
    readonly code = "unauthorized";
  }
  return {
    AccessError,
    SessionRequiredError,
    approved: vi.fn(),
    session: vi.fn(),
    verifyJwt: vi.fn(),
    mint: vi.fn(),
    upstreamMint: vi.fn(),
    approveDevice: vi.fn(),
    buildServer: vi.fn(),
    issueCode: vi.fn(),
    refresh: vi.fn(),
    scope: vi.fn(),
    fetch: vi.fn(),
    consumeCode: vi.fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/mcp/code-redemption", () => ({
  consumeAuthorizationCode: mocks.consumeCode,
}));
vi.mock("@/lib/access/service", () => ({
  AccessError: mocks.AccessError,
  requireApprovedExternalAccount: mocks.approved,
}));
vi.mock("@/lib/external-accounts/service", () => ({
  configuredPymthouseScope: mocks.scope,
}));
vi.mock("@/lib/console/session-user", () => ({
  SessionRequiredError: mocks.SessionRequiredError,
  requireConsoleSession: mocks.session,
}));
vi.mock("@/lib/mcp/jwt", () => ({
  verifyMcpUserJwt: mocks.verifyJwt,
  extractBearer: (value: string | null) =>
    value?.startsWith("Bearer ") ? value.slice(7) : null,
}));
vi.mock("@/lib/mcp/mcp-server", () => ({
  buildRawMcpServer: mocks.buildServer,
}));
vi.mock(
  "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js",
  () => ({
    WebStandardStreamableHTTPServerTransport: class {
      async handleRequest() {
        return Response.json({ ok: true });
      }
    },
  })
);
vi.mock("@/lib/mcp/as", () => ({
  parsePending: () => ({
    redirectUri: "https://client.example/cb",
    codeChallenge: "challenge",
    clientId: "client",
    clientState: "state",
  }),
  issueAuthCode: mocks.issueCode,
  parseAuthCode: () => ({
    redirectUri: "https://client.example/cb",
    codeChallenge: "challenge",
    clientId: "client",
    externalUserId: "eu_legacy",
    exp: Date.now() + 600_000,
  }),
  parseClientId: () => ({ redirectUris: ["https://client.example/cb"] }),
  verifyPkceS256: () => true,
  PKCE_COOKIE: "pkce",
  pkceCookieOptions: () => ({ path: "/", httpOnly: true }),
}));
vi.mock("@/lib/console/mcp-internal-mint", () => ({
  mintMcpUserTokens: mocks.mint,
  BillingAppMismatchError: class extends Error {},
}));
vi.mock("@/lib/console/mcp-oauth-login-bridge", () => ({
  redeemMcpRefreshToken: mocks.refresh,
  issueMcpRefreshToken: () => "mcp_rt_unchanged",
  billingAppMismatch: () => null,
}));
vi.mock("@/lib/console/pymthouse-bff", () => ({
  mintEndUserAccessToken: mocks.upstreamMint,
  createPmtHouseClientForPublicApp: () => ({
    approveDeviceLogin: mocks.approveDevice,
    parseDeviceApprovalRedirect: () => ({
      clientId: "app_fixture",
      userCode: "synthetic-code",
    }),
  }),
}));
vi.mock("@/lib/console/pymthouse-http", () => ({
  readPublicClientId: () => "app_fixture",
  pymthouseAppsOrigin: () => "https://issuer.example",
  readPymthouseM2mConfig: () => ({
    issuerUrl: "https://issuer.example/api/v1/oidc",
  }),
}));

import { POST as redeem } from "@/app/token/route";
import { GET as callback } from "@/app/api/mcp/oauth/callback/route";
import { POST as keyExchange } from "@/app/api/pymthouse/keys/exchange/route";
import {
  GET as mcpGet,
  DELETE as mcpDelete,
  OPTIONS as mcpOptions,
} from "@/app/api/mcp/route";
import { handleMcpRequest } from "@/lib/mcp/mcp-http";
import { approveDevice } from "@/lib/console/device-approval";
import { POST as deviceApproval } from "@/app/api/v1/auth/device/approve/route";
import { pymthouseErrorResponse } from "@/app/api/pymthouse/route-helpers";

const configuredScope = {
  service: "pymthouse",
  issuer: "https://issuer.example/api/v1/oidc",
  appId: "app_fixture",
};
const principal = {
  sub: "eu_legacy",
  externalUserId: "eu_legacy",
  publicClientId: "app_fixture",
  scope: "sign:job",
  token: "signed-token",
};
function tokenRequest(grantType: string) {
  return new NextRequest("https://console.example/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: grantType,
      refresh_token: "refresh",
      code: "code",
      client_id: "client",
      redirect_uri: "https://client.example/cb",
      code_verifier: "verifier",
    }),
  });
}
function keyRequest() {
  return new Request("https://console.example/api/pymthouse/keys/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "synthetic-key" }),
  });
}

function codeRequest(code: string) {
  return new NextRequest("https://console.example/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: "client",
      redirect_uri: "https://client.example/cb",
      code_verifier: "verifier",
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consumeCode.mockReset().mockResolvedValue(true);
  vi.stubEnv("MCP_PUBLIC_ORIGIN", "https://console.example");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.scope.mockReturnValue(configuredScope);
  mocks.approved.mockResolvedValue({
    state: "approved",
    userId: "user-fixture",
  });
  mocks.session.mockResolvedValue({
    externalUserId: "eu_legacy",
    email: "fixture@example.invalid",
  });
  mocks.verifyJwt.mockResolvedValue(principal);
  mocks.refresh.mockReturnValue("eu_legacy");
  mocks.issueCode.mockReturnValue("code-fixture");
  mocks.buildServer.mockReturnValue({
    connect: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  });
  mocks.mint.mockResolvedValue({
    access_token: "signed-token",
    refresh_token: "mcp_rt_unchanged",
    token_type: "Bearer",
    expires_in: 300,
  });
  mocks.upstreamMint.mockResolvedValue({
    access_token: "signed-token",
    expires_in: 300,
    scope: "sign:job",
  });
  mocks.fetch.mockImplementation(async () =>
    Response.json({ access_token: "signed-token", expires_in: 300 })
  );
});

describe("revocation enforced at every credential and request boundary", () => {
  it("uses one receipt for whitespace variants accepted by the code parser", async () => {
    const used = new Set<string>();
    mocks.consumeCode.mockImplementation(async (code: string) => {
      if (used.has(code)) return false;
      used.add(code);
      return true;
    });
    const statuses = [];
    for (const code of ["code", " code", "code ", "\tcode\n"])
      statuses.push((await redeem(codeRequest(code))).status);
    expect(statuses).toEqual([200, 400, 400, 400]);
    expect(mocks.mint).toHaveBeenCalledTimes(1);
  });
  it("rejects sequential and concurrent authorization-code replay before mint", async () => {
    const used = new Set<string>();
    mocks.consumeCode.mockImplementation(async (code: string) => {
      if (used.has(code)) return false;
      used.add(code);
      return true;
    });
    const responses = await Promise.all([
      redeem(tokenRequest("authorization_code")),
      redeem(tokenRequest("authorization_code")),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await redeem(tokenRequest("authorization_code"))).status).toBe(400);
    expect(mocks.mint).toHaveBeenCalledTimes(1);
  });
  it("does not mint if the durable code receipt cannot be recorded", async () => {
    mocks.consumeCode.mockRejectedValue(new mocks.AccessError("unavailable"));
    expect((await redeem(tokenRequest("authorization_code"))).status).toBe(503);
    expect(mocks.mint).not.toHaveBeenCalled();
  });
  it.each(["pending", "revoked", "disabled", "unavailable"])(
    "blocks %s authorization-code and refresh redemption before mint",
    async (state) => {
      mocks.approved.mockRejectedValue(new mocks.AccessError(state));
      for (const grant of ["authorization_code", "refresh_token"]) {
        const response = await redeem(tokenRequest(grant));
        expect(response.status).toBe(state === "unavailable" ? 503 : 403);
        expect(await response.json()).toMatchObject({
          error: `access_${state}`,
        });
      }
      expect(mocks.mint).not.toHaveBeenCalled();
    }
  );

  it("preserves successful legacy external IDs and token response formats", async () => {
    for (const grant of ["authorization_code", "refresh_token"]) {
      const response = await redeem(tokenRequest(grant));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        access_token: "signed-token",
        refresh_token: "mcp_rt_unchanged",
        token_type: "Bearer",
      });
    }
    expect(mocks.approved).toHaveBeenCalledWith(configuredScope, "eu_legacy");
    expect(mocks.mint).toHaveBeenCalledWith({ externalUserId: "eu_legacy" });
  });

  it.each(["pending", "revoked", "disabled", "unavailable"])(
    "blocks %s bearer requests, SSE, and DELETE before server/tool construction",
    async (state) => {
      mocks.approved.mockRejectedValue(new mocks.AccessError(state));
      const headers = {
        Authorization: "Bearer previously-issued",
        Accept: "text/event-stream",
      };
      const responses = [
        await handleMcpRequest(
          new Request("https://console.example/api/mcp", {
            method: "POST",
            headers,
          })
        ),
        await mcpGet(
          new NextRequest("https://console.example/api/mcp", { headers })
        ),
        await mcpDelete(
          new NextRequest("https://console.example/api/mcp", {
            method: "DELETE",
            headers,
          })
        ),
      ];
      for (const response of responses) {
        expect(response.status).toBe(state === "unavailable" ? 503 : 403);
        expect(response.headers.get("www-authenticate")).toBeNull();
      }
      expect(mocks.buildServer).not.toHaveBeenCalled();
    }
  );

  it("keeps plain GET and OPTIONS public without touching identity storage", async () => {
    mocks.approved.mockRejectedValue(new mocks.AccessError("unavailable"));
    expect(
      (await mcpGet(new NextRequest("https://console.example/api/mcp"))).status
    ).toBe(200);
    expect(
      mcpOptions(
        new NextRequest("https://console.example/api/mcp", {
          method: "OPTIONS",
        })
      ).status
    ).toBe(204);
    expect(mocks.approved).not.toHaveBeenCalled();
  });

  it("does not cache approval for an already-issued bearer token", async () => {
    const request = () =>
      new Request("https://console.example/api/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer previously-issued" },
      });
    expect((await handleMcpRequest(request())).status).toBe(200);
    mocks.approved.mockRejectedValue(new mocks.AccessError("revoked"));
    expect((await handleMcpRequest(request())).status).toBe(403);
    expect(mocks.approved).toHaveBeenCalledTimes(2);
    expect(mocks.buildServer).toHaveBeenCalledTimes(1);
  });

  it("distinguishes absent/invalid authentication with a 401 challenge", async () => {
    const absent = await handleMcpRequest(
      new Request("https://console.example/api/mcp", { method: "POST" })
    );
    expect(absent.status).toBe(401);
    expect(absent.headers.get("www-authenticate")).toContain("Bearer");
    mocks.verifyJwt.mockRejectedValue(new Error("wrong app"));
    const invalid = await handleMcpRequest(
      new Request("https://console.example/api/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-app" },
      })
    );
    expect(invalid.status).toBe(401);
    expect(mocks.approved).not.toHaveBeenCalled();
  });

  it.each(["pending", "revoked", "disabled", "unavailable"])(
    "blocks %s callback without issuing authorization code",
    async (state) => {
      mocks.session.mockRejectedValue(new mocks.AccessError(state));
      const response = await callback(
        new NextRequest("https://console.example/api/mcp/oauth/callback")
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "https://console.example/access-pending?from=mcp"
      );
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
      expect(mocks.issueCode).not.toHaveBeenCalled();
    }
  );

  it("returns unsigned-in callback to authentication without creating a code", async () => {
    mocks.session.mockRejectedValue(new mocks.SessionRequiredError());
    const response = await callback(
      new NextRequest("https://console.example/api/mcp/oauth/callback")
    );
    expect(response.headers.get("location")).toContain("/auth/login");
    expect(mocks.issueCode).not.toHaveBeenCalled();
  });

  it("issues approved callback with persisted external alias and original client state", async () => {
    const response = await callback(
      new NextRequest("https://console.example/api/mcp/oauth/callback")
    );
    const target = new URL(response.headers.get("location")!);
    expect(target.searchParams.get("state")).toBe("state");
    expect(target.searchParams.get("code")).toBe("code-fixture");
    expect(mocks.issueCode).toHaveBeenCalledWith(
      expect.objectContaining({ externalUserId: "eu_legacy" })
    );
  });

  it.each(["revoked", "unavailable"])(
    "blocks %s device approval before upstream call",
    async (state) => {
      mocks.approved.mockRejectedValue(new mocks.AccessError(state));
      await expect(
        approveDevice({
          clientId: "app_fixture",
          userCode: "synthetic-code",
          externalUserId: "eu_legacy",
        })
      ).rejects.toMatchObject({ status: state === "unavailable" ? 503 : 403 });
      expect(mocks.approveDevice).not.toHaveBeenCalled();
    }
  );

  it("rejects wrong device app before approval/mint", async () => {
    await expect(
      approveDevice({
        clientId: "app_wrong",
        userCode: "synthetic-code",
        externalUserId: "eu_legacy",
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.approveDevice).not.toHaveBeenCalled();
    expect(mocks.approved).not.toHaveBeenCalled();
  });

  it.each([undefined, "https://attacker.example"])(
    "blocks device cross-site/missing Origin (%s) before session or upstream calls",
    async (origin) => {
      const response = await deviceApproval(
        new NextRequest("https://console.example/api/v1/auth/device/approve", {
          method: "POST",
          headers: origin ? { Origin: origin } : {},
          body: "{}",
        })
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        code: "cross_site_request",
      });
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.approveDevice).not.toHaveBeenCalled();
    }
  );

  it.each(["signed-out", "revoked", "unavailable"])(
    "enforces %s on direct device endpoint requests",
    async (state) => {
      mocks.session.mockRejectedValue(
        state === "signed-out"
          ? new mocks.SessionRequiredError()
          : new mocks.AccessError(state)
      );
      const response = await deviceApproval(
        new NextRequest("https://console.example/api/v1/auth/device/approve", {
          method: "POST",
          headers: { Origin: "https://console.example" },
          body: "{}",
        })
      );
      expect(response.status).toBe(
        state === "signed-out" ? 401 : state === "unavailable" ? 503 : 403
      );
      expect(mocks.approveDevice).not.toHaveBeenCalled();
    }
  );

  it("approves devices using the session-owned persisted alias, never a body-supplied owner", async () => {
    const response = await deviceApproval(
      new NextRequest("https://console.example/api/v1/auth/device/approve", {
        method: "POST",
        headers: { Origin: "https://console.example" },
        body: JSON.stringify({
          externalUserId: "eu_attacker",
          iss: "https://issuer.example",
          target_link_uri: "synthetic-target",
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.approveDevice).toHaveBeenCalledWith(
      expect.objectContaining({ externalUserId: "eu_legacy" })
    );
  });

  it("rechecks approved accounts even at internal mint and signer-exchange boundaries", async () => {
    const actual = await vi.importActual<
      typeof import("@/lib/console/mcp-internal-mint")
    >("@/lib/console/mcp-internal-mint");
    mocks.approved.mockRejectedValue(new mocks.AccessError("revoked"));
    await expect(
      actual.mintMcpUserTokens({ externalUserId: "eu_legacy" })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      actual.exchangeMcpSignerSession({ accessToken: "signed-token" })
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.upstreamMint).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(["revoked", "unavailable"])(
    "never returns exchanged API-key credentials for %s users",
    async (state) => {
      mocks.approved.mockRejectedValue(new mocks.AccessError(state));
      const response = await keyExchange(keyRequest());
      expect(response.status).toBe(state === "unavailable" ? 503 : 403);
      expect(await response.text()).not.toContain("signed-token");
      expect(mocks.verifyJwt).toHaveBeenCalledWith("signed-token");
    }
  );

  it("never exposes opaque/wrong-app exchanged credentials or trusts unverified ownership", async () => {
    mocks.verifyJwt.mockRejectedValue(new Error("signature/app invalid"));
    const response = await keyExchange(keyRequest());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("signed-token");
    expect(mocks.approved).not.toHaveBeenCalled();
  });

  it("releases key exchange credentials only after signed owner approval", async () => {
    const response = await keyExchange(keyRequest());
    expect(response.status).toBe(200);
    expect(mocks.approved).toHaveBeenCalledWith(configuredScope, "eu_legacy");
    expect(await response.json()).toMatchObject({
      access_token: "signed-token",
    });
  });

  it("maps shared access failures to 403/503 rather than generic 502", async () => {
    for (const state of ["revoked", "unavailable"]) {
      const response = pymthouseErrorResponse(
        new mocks.AccessError(state),
        "fallback"
      );
      expect(response.status).toBe(state === "unavailable" ? 503 : 403);
    }
  });

  it("missing scope configuration fails closed before mint", async () => {
    mocks.scope.mockImplementation(() => {
      throw new Error("missing config");
    });
    expect((await redeem(tokenRequest("refresh_token"))).status).toBe(503);
    expect(mocks.approved).not.toHaveBeenCalled();
    expect(mocks.mint).not.toHaveBeenCalled();
  });
});
