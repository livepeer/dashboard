import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/authentication/session", () => ({
  getAuthenticatedIdentity: vi.fn(),
}));
vi.mock("@/lib/identity/provider-user", () => ({
  resolveProviderIdentity: vi.fn(),
}));
vi.mock("@/lib/access/enrollment", () => ({
  enrollAuthenticatedUser: vi.fn(),
}));
vi.mock("@/lib/access/service", () => ({ getAccessDecision: vi.fn() }));
vi.mock("@/lib/admin/permissions", () => ({
  getAdminPrincipalForUser: vi.fn(),
}));
import { getAuthenticatedIdentity } from "@/lib/authentication/session";
import { resolveProviderIdentity } from "@/lib/identity/provider-user";
import { enrollAuthenticatedUser } from "@/lib/access/enrollment";
import { getAccessDecision } from "@/lib/access/service";
import { getAdminPrincipalForUser } from "@/lib/admin/permissions";
import { GET } from "@/app/api/identity/sync/route";
const identity = {
  authority: "auth0",
  issuer: "https://auth.invalid",
  subject: "auth0|fixture",
  emailVerified: true,
  email: "fixture@example.invalid",
};
const canonical = {
  userId: "user",
  identityId: "identity",
  accountStatus: "active" as const,
  conflicts: [],
  identityCreated: false,
};
const request = (query = "") =>
  new NextRequest(`https://preview.invalid/api/identity/sync${query}`);
describe("post-Auth0 landing and enrollment context", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAuthenticatedIdentity).mockResolvedValue(identity);
    vi.mocked(resolveProviderIdentity).mockResolvedValue(canonical);
    vi.mocked(enrollAuthenticatedUser).mockResolvedValue({
      enrolled: true,
      signupId: "signup",
    });
    vi.mocked(getAccessDecision).mockResolvedValue({
      state: "pending",
      userId: "user",
    });
    vi.mocked(getAdminPrincipalForUser).mockResolvedValue(null);
  });
  it("returns retired waitlist Auth0 transactions to the Resend form without enrolling", async () => {
    expect(
      (
        await GET(
          request("?from=waitlist&ref=friend&utm_source=campaign&role=admin")
        )
      ).headers.get("location")
    ).toBe("https://preview.invalid/waitlist?ref=friend&utm_source=campaign");
    expect(enrollAuthenticatedUser).not.toHaveBeenCalled();
  });
  it("sends approved ordinary users home and administrators to administration", async () => {
    vi.mocked(getAccessDecision).mockResolvedValue({
      state: "approved",
      userId: "user",
    });
    expect(
      (await GET(request("?returnTo=%2Fhome"))).headers.get("location")
    ).toBe("https://preview.invalid/home");
    vi.mocked(getAdminPrincipalForUser).mockResolvedValue({
      adminGrantId: "grant",
      signupId: "signup",
      userId: "user",
    });
    expect((await GET(request())).headers.get("location")).toBe(
      "https://preview.invalid/admin"
    );
  });
  it("preserves safe explicit member/device/MCP destinations without treating them as approval", async () => {
    for (const path of [
      "/waitlist",
      "/device?user_code=ABC",
      "/api/mcp/oauth/callback?state=opaque",
    ])
      expect(
        (
          await GET(request(`?returnTo=${encodeURIComponent(path)}`))
        ).headers.get("location")
      ).toBe(`https://preview.invalid${path}`);
    expect(
      (await GET(request("?returnTo=%2F%2Fevil.invalid"))).headers.get(
        "location"
      )
    ).toBe("https://preview.invalid/access-pending");
  });
  it("retains authentication on storage failure but routes to the fail-closed waiting surface", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(resolveProviderIdentity).mockRejectedValue(
      new Error("unavailable")
    );
    expect((await GET(request())).headers.get("location")).toBe(
      "https://preview.invalid/access-pending"
    );
    log.mockRestore();
  });
});
